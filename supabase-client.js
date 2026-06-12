(function () {
  const PROVIDER_KEY = "tastory-oms-data-provider-v2";
  const BACKUP_KEY = "tastory-oms-backup-before-supabase-v1";
  const ORDER_KEY = "tastory-oms-orders-v1";
  const SETTINGS_KEY = "tastory-oms-settings-v1";
  const PASSWORD_SETUP_KEY = "tastory-oms-password-setup-v1";
  const config = window.TASTORY_CONFIG || {};
  const authCallback = window.TastoryAuthCallback;
  const initialCallback = authCallback?.parse(location.href) || { active: false };

  let client = null;
  let channel = null;
  let realtimeTimer = null;

  if (initialCallback.active) {
    setProvider("supabase");
    authCallback.clearCachedSession(localStorage, config.supabaseUrl);
  }

  function provider() {
    return localStorage.getItem(PROVIDER_KEY) || config.defaultProvider || "local";
  }

  function setProvider(value) {
    localStorage.setItem(PROVIDER_KEY, value === "supabase" ? "supabase" : "local");
  }

  function getClient() {
    if (client) return client;
    if (!window.supabase?.createClient || !config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error("Supabase configuration is unavailable.");
    }
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return client;
  }

  async function processAuthCallback() {
    if (!initialCallback.active) return { session: null, mode: "" };
    const result = await authCallback.exchange(getClient(), initialCallback);
    setProvider("supabase");
    if (result.mode && result.session?.user?.id) {
      localStorage.setItem(PASSWORD_SETUP_KEY, JSON.stringify({
        userId: result.session.user.id,
        mode: result.mode,
      }));
    }
    history.replaceState({}, "", authCallback.cleanUrl(location.href, result.mode));
    return result;
  }

  function pendingPasswordSetup(currentSession) {
    if (!currentSession?.user?.id) return "";
    try {
      const pending = JSON.parse(localStorage.getItem(PASSWORD_SETUP_KEY));
      return pending?.userId === currentSession.user.id ? pending.mode || "" : "";
    } catch {
      return "";
    }
  }

  function completePasswordSetup() {
    localStorage.removeItem(PASSWORD_SETUP_KEY);
  }

  async function session() {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    setProvider("supabase");
    return data.session;
  }

  async function signOut() {
    if (client) await client.auth.signOut();
  }

  async function requestPasswordReset(email) {
    const redirectTo = `${location.origin}${location.pathname}?auth=reset`;
    const { error } = await getClient().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function updatePassword(password) {
    const { error } = await getClient().auth.updateUser({ password });
    if (error) throw error;
  }

  async function activeBusinessId() {
    const currentSession = await session();
    if (!currentSession) return null;
    try {
      const payload = currentSession.access_token.split(".")[1]
        .replaceAll("-", "+")
        .replaceAll("_", "/");
      const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
      const claim = JSON.parse(atob(padded)).active_business_id;
      if (claim) return claim;
    } catch {
      // Fall through to the live profile when custom Auth claims are unavailable.
    }
    const { data, error } = await getClient()
      .from("users")
      .select("active_business_id")
      .eq("id", currentSession.user.id)
      .single();
    if (error) throw error;
    return data?.active_business_id || null;
  }

  async function loadAccessContext() {
    const currentSession = await session();
    if (!currentSession) return { businessId: null, roles: [] };
    const businessId = await activeBusinessId();
    if (!businessId) return { businessId: null, roles: [] };
    const { data, error } = await getClient()
      .from("user_roles")
      .select("roles(code)")
      .eq("business_id", businessId)
      .eq("user_id", currentSession.user.id);
    if (error) throw error;
    return {
      businessId,
      roles: (data || []).map((entry) => entry.roles?.code).filter(Boolean),
    };
  }

  async function touchSession() {
    const { error } = await getClient().rpc("touch_staff_session");
    if (error) throw error;
  }

  async function loadStaff() {
    const { data, error } = await getClient().rpc("list_staff_management");
    if (error) throw error;
    return data || [];
  }

  async function invitationAction(action, values) {
    const businessId = await activeBusinessId();
    if (!businessId) throw new Error("Active Tastory business is unavailable.");
    const { data, error } = await getClient().functions.invoke("invite-user", {
      body: {
        action,
        business_id: businessId,
        ...values,
      },
    });
    if (error) {
      const context = error.context;
      if (context?.json) {
        const details = await context.json().catch(() => null);
        throw new Error(details?.error || error.message);
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function inviteStaff(values) {
    return invitationAction("invite", values);
  }

  async function resendInvitation(invitationId) {
    return invitationAction("resend", { invitation_id: invitationId });
  }

  async function cancelInvitation(invitationId) {
    return invitationAction("cancel", { invitation_id: invitationId });
  }

  async function changeStaffRole(userId, roleCode) {
    const { error } = await getClient().rpc("change_staff_role", {
      requested_user_id: userId,
      requested_role_code: roleCode,
    });
    if (error) throw error;
  }

  async function setStaffActive(userId, active) {
    const { error } = await getClient().rpc("set_staff_active", {
      requested_user_id: userId,
      requested_active: active,
    });
    if (error) throw error;
  }

  async function removeStaff(userId) {
    const { error } = await getClient().rpc("remove_staff_member", {
      requested_user_id: userId,
    });
    if (error) throw error;
  }

  function paymentLabel(value) {
    return {
      unpaid: "Unpaid",
      deposit_paid: "Deposit Paid",
      paid: "Paid",
    }[value] || "Unpaid";
  }

  function mapOrder(row) {
    const customer = row.customers || {};
    const status = row.production_statuses || {};
    const delivery = row.delivery_methods || {};
    const items = (row.order_items || []).map((item) => ({
      productId: item.product_variant_id,
      productName: item.product_name_snapshot,
      variantName: item.variant_name_snapshot,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
    }));
    return {
      id: row.order_number,
      dbId: row.id,
      version: row.version,
      customerName: customer.name || "Unknown customer",
      phone: customer.phone || "",
      address: row.delivery_address || customer.default_address || "",
      latestDeliveryDate: row.latest_delivery_date || "",
      paymentStatus: paymentLabel(row.payment_status),
      paymentMethod: row.payment_method || "",
      amountPaid: Number(row.amount_paid || 0),
      productionStatus: status.name || "New Order",
      productionStatusId: row.production_status_id,
      deliveryMethod: delivery.name === "Other"
        ? row.delivery_method_other || "Other"
        : delivery.name || "",
      deliveryPerson: row.delivery_person || "",
      trackingNumber: row.tracking_number || "",
      actualDeliveryDate: row.actual_delivery_at?.slice(0, 10) || "",
      batchId: row.batch_id || "",
      customerNotes: row.customer_notes_snapshot || customer.notes || "",
      remarks: row.remarks || "",
      items,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function loadCatalog() {
    const { data, error } = await getClient()
      .from("product_variants")
      .select("id,sku,size_label,products!inner(name,is_active),pricing(amount,valid_from,valid_to)")
      .eq("is_active", true)
      .eq("products.is_active", true)
      .is("pricing.valid_to", null);
    if (error) throw error;
    const tones = [
      "bg-amber-100 text-amber-800",
      "bg-stone-200 text-stone-800",
      "bg-lime-100 text-lime-800",
      "bg-orange-100 text-orange-900",
      "bg-rose-100 text-rose-800",
    ];
    return (data || []).map((variant, index) => ({
      id: variant.id,
      legacyId: variant.sku?.startsWith("LEGACY:") ? variant.sku.slice(7) : "",
      flavor: variant.products.name,
      size: variant.size_label,
      price: Number(variant.pricing?.[0]?.amount || 0),
      tone: tones[index % tones.length],
    }));
  }

  async function loadOrders() {
    const { data, error } = await getClient()
      .from("orders")
      .select(`
        *,
        customers(name,phone,default_address,notes),
        production_statuses(id,name,code),
        delivery_methods(name),
        order_items(id,product_variant_id,product_name_snapshot,variant_name_snapshot,quantity,unit_price)
      `)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapOrder);
  }

  async function loadWorkspace() {
    const [orders, products, access] = await Promise.all([
      loadOrders(),
      loadCatalog(),
      loadAccessContext(),
    ]);
    return { orders, products, access };
  }

  async function saveOrder(order) {
    const payload = {
      order_id: order.dbId || null,
      order_number: order.id,
      expected_version: order.version || null,
      customer_name: order.customerName,
      phone: order.phone,
      address: order.address,
      latest_delivery_date: order.latestDeliveryDate || null,
      payment_method: order.paymentMethod || null,
      amount_paid: Number(order.amountPaid || 0),
      production_status: order.productionStatus,
      delivery_method: order.deliveryMethod || null,
      delivery_person: order.deliveryPerson || null,
      tracking_number: order.trackingNumber || null,
      actual_delivery_date: order.actualDeliveryDate || null,
      batch_id: order.batchId || null,
      customer_notes: order.customerNotes || null,
      remarks: order.remarks || null,
      legacy_order_id: order.legacyOrderId || null,
      created_at: order.createdAt || null,
      items: order.items.map((item) => ({
        product_variant_id: item.productId,
        quantity: Number(item.quantity),
        unit_price: Number(item.unitPrice),
      })),
    };
    const { data, error } = await getClient().rpc("save_oms_order", { payload });
    if (error) throw error;
    return data;
  }

  async function archiveOrder(order) {
    const { error } = await getClient().rpc("archive_oms_order", {
      requested_order_id: order.dbId,
      expected_version: order.version,
    });
    if (error) throw error;
  }

  async function advanceStatus(order, statusName) {
    const { data: statuses, error: statusError } = await getClient()
      .from("production_statuses")
      .select("id,name")
      .eq("name", statusName)
      .single();
    if (statusError) throw statusError;
    const { data, error } = await getClient().rpc("advance_production_status", {
      requested_order_id: order.dbId,
      requested_status_id: statuses.id,
      expected_version: order.version,
      status_comment: null,
    });
    if (error) throw error;
    return data;
  }

  async function saveCatalog(products) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const { data, error } = await getClient().rpc("save_oms_catalog", {
      catalog: products.map((product) => ({
        id: product.id,
        legacy_id: product.legacyId || (uuidPattern.test(String(product.id)) ? null : product.id),
        flavor: product.flavor,
        size: product.size,
        price: Number(product.price),
      })),
    });
    if (error) throw error;
    return data;
  }

  function createBackup(refresh = false) {
    if (!refresh && localStorage.getItem(BACKUP_KEY)) {
      return JSON.parse(localStorage.getItem(BACKUP_KEY));
    }
    const backup = {
      format: "tastory-oms-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceOrigin: location.origin,
      orders: JSON.parse(localStorage.getItem(ORDER_KEY) || "[]"),
      settings: JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
    };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    return backup;
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function importLocalData() {
    const backup = createBackup(true);
    const fileHash = await sha256(JSON.stringify({
      format: backup.format,
      version: backup.version,
      sourceOrigin: backup.sourceOrigin,
      orders: backup.orders,
      settings: backup.settings,
    }));
    const counts = {
      orders: backup.orders.length,
      products: backup.settings.products?.length || 0,
    };
    const { data: runId, error: runError } = await getClient().rpc("begin_local_storage_migration", {
      source_file_name: `BrowserBackup_${backup.exportedAt.slice(0, 10)}.json`,
      source_file_sha256: fileHash,
      source_origin: backup.sourceOrigin,
      source_version: String(backup.version),
      expected_counts: counts,
    });
    if (runError) throw runError;
    const { data: existingRun, error: existingRunError } = await getClient()
      .from("migration_runs")
      .select("status,imported_counts")
      .eq("id", runId)
      .single();
    if (existingRunError) throw existingRunError;
    if (existingRun?.status === "completed") {
      return {
        importedOrders: Number(existingRun.imported_counts?.orders || 0),
        importedProducts: Number(existingRun.imported_counts?.products || 0),
        runId,
        duplicate: true,
      };
    }

    try {
      const savedProducts = await saveCatalog(backup.settings.products || []);
      const variantMap = new Map(savedProducts.map((product) => [product.legacy_id, product.id]));
      let importedOrders = 0;
      for (const legacyOrder of backup.orders) {
        const mapped = {
          ...legacyOrder,
          dbId: null,
          legacyOrderId: legacyOrder.id,
          items: legacyOrder.items.map((item) => ({
            ...item,
            productId: variantMap.get(item.productId),
          })),
        };
        if (mapped.items.every((item) => item.productId)) {
          await saveOrder(mapped);
          importedOrders += 1;
        }
      }
      const { error: completeError } = await getClient().rpc("complete_migration_run", {
        requested_run_id: runId,
        requested_imported_counts: {
          orders: importedOrders,
          products: savedProducts.length,
        },
        requested_validation_results: {
          local_orders_retained: true,
          backup_key: BACKUP_KEY,
        },
      });
      if (completeError) throw completeError;
      return { importedOrders, importedProducts: savedProducts.length, runId };
    } catch (error) {
      await getClient().rpc("fail_migration_run", {
        requested_run_id: runId,
        failure_message: error.message,
      });
      throw error;
    }
  }

  function subscribe(onChange) {
    if (channel) getClient().removeChannel(channel);
    channel = getClient()
      .channel("tastory-oms-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_status_history" }, schedule)
      .subscribe();

    function schedule() {
      clearTimeout(realtimeTimer);
      realtimeTimer = setTimeout(onChange, 180);
    }
  }

  function unsubscribe() {
    if (channel && client) client.removeChannel(channel);
    channel = null;
  }

  async function logClientEvent(action, metadata = {}) {
    const { error } = await getClient().rpc("log_oms_client_event", {
      requested_action: action,
      requested_metadata: metadata,
    });
    if (error) throw error;
  }

  window.TastoryCloud = {
    provider,
    setProvider,
    processAuthCallback,
    pendingPasswordSetup,
    completePasswordSetup,
    session,
    signIn,
    signOut,
    requestPasswordReset,
    updatePassword,
    loadAccessContext,
    touchSession,
    loadStaff,
    inviteStaff,
    resendInvitation,
    cancelInvitation,
    changeStaffRole,
    setStaffActive,
    removeStaff,
    loadWorkspace,
    saveOrder,
    archiveOrder,
    advanceStatus,
    saveCatalog,
    importLocalData,
    createBackup,
    logClientEvent,
    subscribe,
    unsubscribe,
  };
})();
