const STORAGE_KEY = "tastory-oms-orders-v1";
const SETTINGS_KEY = "tastory-oms-settings-v1";
const CLOUD = window.TastoryCloud;

function isCloudMode() {
  return CLOUD?.provider() === "supabase";
}

function cloudRoles() {
  if (!isCloudMode()) return ["admin"];
  if (state?.cloudRoleCodes?.length) return state.cloudRoleCodes;
  if (!state?.cloudSession?.access_token) return [];
  try {
    const payload = state.cloudSession.access_token.split(".")[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded)).app_roles || [];
  } catch {
    return [];
  }
}

function canUse(capability) {
  if (!isCloudMode()) return true;
  const roles = cloudRoles();
  const allowed = {
    createOrder: ["admin", "manager", "sales_staff"],
    editOrder: ["admin", "manager"],
    archiveOrder: ["admin", "manager"],
    updateProduction: ["admin", "manager", "production_staff"],
    managePricing: ["admin"],
    manageStaff: ["admin"],
  };
  return (allowed[capability] || []).some((role) => roles.includes(role));
}

const DEFAULT_PRODUCTS = [
  { id: "classic-35", flavor: "Classic", size: "35g", price: 4.5, tone: "bg-amber-100 text-amber-800" },
  { id: "classic-150", flavor: "Classic", size: "150g", price: 15, tone: "bg-amber-100 text-amber-800" },
  { id: "chocolate-35", flavor: "Chocolate", size: "35g", price: 5.5, tone: "bg-stone-200 text-stone-800" },
  { id: "chocolate-150", flavor: "Chocolate", size: "150g", price: 18, tone: "bg-stone-200 text-stone-800" },
  { id: "matcha-35", flavor: "Matcha", size: "35g", price: 5.5, tone: "bg-lime-100 text-lime-800" },
  { id: "matcha-150", flavor: "Matcha", size: "150g", price: 18, tone: "bg-lime-100 text-lime-800" },
  { id: "coffee-35", flavor: "Coffee", size: "35g", price: 5.5, tone: "bg-orange-100 text-orange-900" },
  { id: "coffee-150", flavor: "Coffee", size: "150g", price: 18, tone: "bg-orange-100 text-orange-900" },
  { id: "cinnamon-35", flavor: "Cinnamon", size: "35g", price: 5.5, tone: "bg-rose-100 text-rose-800" },
  { id: "cinnamon-150", flavor: "Cinnamon", size: "150g", price: 18, tone: "bg-rose-100 text-rose-800" },
];

const PAYMENT_STATUSES = ["Unpaid", "Deposit Paid", "Paid"];
const PAYMENT_METHODS = ["DuitNow", "Bank Transfer", "TNG", "Cash", "COD"];
const PRODUCTION_STATUSES = [
  "New Order",
  "Waiting For Batch",
  "Scheduled For Baking",
  "Baking",
  "Packed",
  "Ready For Delivery",
  "Delivered",
  "Closed",
  "Cancelled",
];
const QUICK_PRODUCTION_WORKFLOW = [
  "Waiting For Batch",
  "Scheduled For Baking",
  "Baking",
  "Packed",
  "Ready For Delivery",
  "Delivered",
];
const DELIVERY_METHODS = ["Self Delivery", "Friend Delivery", "Courier", "Customer Pickup"];
const STAFF_ROLES = [
  { code: "admin", name: "Admin", description: "Full access, including staff, pricing, settings, and reports." },
  { code: "manager", name: "Manager", description: "Manages customers, orders, production, inventory, and reports." },
  { code: "sales_staff", name: "Sales Staff", description: "Creates orders and updates customer details." },
  { code: "production_staff", name: "Production Staff", description: "Views assigned production work and updates its status." },
];

let appSettings = loadSettings();
let PRODUCTS = appSettings.products;

const ICONS = {
  dashboard: '<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>',
  add: '<path d="M11 5h2v14h-2zM5 11h14v2H5z"/>',
  orders: '<path d="M6 2h9l5 5v15H6V2Zm8 2H8v16h10V8h-4V4Zm1 1.4V7h1.6L15 5.4ZM10 11h6v2h-6v-2Zm0 4h6v2h-6v-2Z"/>',
  production: '<path d="M4 4h16v4H4V4Zm1 6h14l-1 10H6L5 10Zm4 2v5h2v-5H9Zm4 0v5h2v-5h-2Z"/>',
  chevron: '<path d="m9 18 6-6-6-6 1.4-1.4 7.4 7.4-7.4 7.4L9 18Z"/>',
  search: '<path d="m19 20-5.2-5.2a7 7 0 1 1 1.4-1.4L20.4 18.6 19 20ZM5 9.5a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0Z"/>',
  close: '<path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/>',
  phone: '<path d="M6.6 2h3l1 5-2.2 1.6a15 15 0 0 0 7 7l1.6-2.2 5 1v3A2.6 2.6 0 0 1 19.4 20C9.8 20 2 12.2 2 2.6A2.6 2.6 0 0 1 4.6 0h2v2Z"/>',
  whatsapp: '<path d="M12 2a9.8 9.8 0 0 0-8.5 14.7L2.4 21.6l5-1.1A9.8 9.8 0 1 0 12 2Zm0 2a7.8 7.8 0 0 1 0 15.6 7.7 7.7 0 0 1-3.9-1.1l-.3-.2-2.8.6.6-2.7-.2-.3A7.8 7.8 0 0 1 12 4Zm-3.2 3.9c-.2 0-.6.1-.9.5-.3.4-1.1 1.1-1.1 2.6s1.1 3 1.2 3.2c.2.2 2.2 3.4 5.3 4.6 2.6 1 3.1.8 3.7.8.6-.1 1.8-.8 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.7-.4l-2.1-1c-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.7.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2.1-.4 0-.5l-1-2.4c-.2-.6-.5-.6-.7-.6h-.3Z"/>',
  calendar: '<path d="M7 2h2v2h6V2h2v2h3v17H4V4h3V2Zm11 8H6v9h12v-9ZM6 6v2h12V6H6Z"/>',
  bag: '<path d="M7 7V6a5 5 0 0 1 10 0v1h3l-1 15H5L4 7h3Zm2 0h6V6a3 3 0 0 0-6 0v1Zm-2.9 2 .7 11h10.4l.7-11H6.1Z"/>',
  edit: '<path d="m16.9 2.7 4.4 4.4L8.4 20H4v-4.4L16.9 2.7Zm0 2.8L6 16.4V18h1.6L18.5 7.1l-1.6-1.6Z"/>',
  trash: '<path d="M8 3V1h8v2h5v2H3V3h5Zm-2 4h12l-1 15H7L6 7Zm2.1 2 .7 11h6.4l.7-11H8.1Z"/>',
};

const VALID_PAGES = ["dashboard", "new-order", "orders", "production", "summary", "pricing", "staff"];

function initialPage() {
  const page = new URLSearchParams(window.location.search).get("page") || window.location.hash.replace("#", "");
  return VALID_PAGES.includes(page) ? page : "dashboard";
}

const state = {
  page: initialPage(),
  orders: loadOrders(),
  orderFilter: "Active",
  orderSearch: "",
  editingId: null,
  cloudSession: null,
  cloudLoading: false,
  cloudError: "",
  cloudConnectedAt: null,
  cloudRoleCodes: [],
  staff: [],
  staffFilter: "all",
  staffLoaded: false,
  staffLoading: false,
};

function icon(name, classes = "h-5 w-5") {
  return `<svg class="${classes}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name]}</svg>`;
}

function dateOffset(days) {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeProduct(product, index = 0) {
  const flavor = String(product.flavor || "Granola").trim() || "Granola";
  const size = String(product.size || "Pack").trim() || "Pack";
  const slug = flavor.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + size.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: product.id || slug + "-" + index,
    flavor,
    size,
    price: Math.max(0, Number(product.price || 0)),
    tone: product.tone || "bg-amber-100 text-amber-800",
  };
}

function loadSettings() {
  const defaults = {
    products: DEFAULT_PRODUCTS.map(normalizeProduct),
    exportFolderName: "",
  };
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!stored || typeof stored !== "object") return defaults;
    const products = Array.isArray(stored.products) && stored.products.length
      ? stored.products.map(normalizeProduct)
      : defaults.products;
    return {
      ...defaults,
      ...stored,
      products,
      exportFolderName: stored.exportFolderName || "",
    };
  } catch (error) {
    console.warn("Could not load settings.", error);
    return defaults;
  }
}

function saveSettings() {
  if (isCloudMode()) {
    const stored = loadSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ...stored,
      exportFolderName: appSettings.exportFolderName || "",
    }));
    return;
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
}

function productById(productId) {
  return PRODUCTS.find((product) => product.id === productId);
}

function productLabel(productId) {
  const product = productById(productId);
  return product ? product.flavor + " " + product.size : productId;
}

function productFlavors() {
  return [...new Set(PRODUCTS.map((product) => product.flavor))];
}

function sampleOrders() {
  return [
    {
      id: "TAS-1048",
      customerName: "Aina Rahman",
      phone: "012-345 6789",
      address: "Taman Melawati, Kuala Lumpur",
      latestDeliveryDate: dateOffset(1),
      paymentStatus: "Paid",
      paymentMethod: "DuitNow",
      amountPaid: 46.5,
      productionStatus: "Ready For Delivery",
      deliveryMethod: "Self Delivery",
      deliveryPerson: "Jane",
      trackingNumber: "",
      actualDeliveryDate: "",
      batchId: "B-2606-02",
      customerNotes: "Less sweet. Leave at guard house.",
      remarks: "Leave at guardhouse after 5pm.",
      items: [
        { productId: "classic-150", quantity: 2 },
        { productId: "chocolate-35", quantity: 3 },
      ],
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
    {
      id: "TAS-1049",
      customerName: "Mei Ling",
      phone: "017-882 1044",
      address: "Subang Jaya, Selangor",
      latestDeliveryDate: dateOffset(2),
      paymentStatus: "Deposit Paid",
      paymentMethod: "Bank Transfer",
      amountPaid: 20,
      productionStatus: "Scheduled For Baking",
      deliveryMethod: "Courier",
      deliveryPerson: "",
      trackingNumber: "",
      actualDeliveryDate: "",
      batchId: "B-2606-03",
      customerNotes: "Call before delivery.",
      remarks: "",
      items: [
        { productId: "matcha-150", quantity: 2 },
        { productId: "coffee-150", quantity: 1 },
      ],
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: "TAS-1050",
      customerName: "Farah Aziz",
      phone: "019-440 2218",
      address: "Ampang, Selangor",
      latestDeliveryDate: dateOffset(4),
      paymentStatus: "Unpaid",
      paymentMethod: "COD",
      amountPaid: 0,
      productionStatus: "Waiting For Batch",
      deliveryMethod: "Friend Delivery",
      deliveryPerson: "Nadia",
      trackingNumber: "",
      actualDeliveryDate: "",
      batchId: "",
      customerNotes: "No raisins. No cinnamon due to allergy.",
      remarks: "No cinnamon due to allergy.",
      items: [
        { productId: "classic-35", quantity: 5 },
        { productId: "chocolate-150", quantity: 2 },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: "TAS-1047",
      customerName: "Daniel Tan",
      phone: "016-210 9001",
      address: "Petaling Jaya, Selangor",
      latestDeliveryDate: dateOffset(-1),
      paymentStatus: "Paid",
      paymentMethod: "TNG",
      amountPaid: 54,
      productionStatus: "Delivered",
      deliveryMethod: "Customer Pickup",
      deliveryPerson: "",
      trackingNumber: "",
      actualDeliveryDate: dateOffset(-1),
      batchId: "B-2606-01",
      customerNotes: "Customer pickup after lunch.",
      remarks: "",
      items: [{ productId: "cinnamon-150", quantity: 3 }],
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
  ];
}

function loadOrders() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored)) {
      const normalized = stored.map(normalizeOrder);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    }
  } catch (error) {
    console.warn("Could not load stored orders.", error);
  }
  const samples = sampleOrders().map(normalizeOrder);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  return samples;
}

function saveOrders() {
  if (isCloudMode()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value, options = {}) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: options.year ? "numeric" : undefined,
  }).format(date);
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(value);
}

function orderTotal(order) {
  return order.items.reduce((sum, item) => {
    const product = productById(item.productId);
    const unitPrice = Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : Number(product?.price || 0);
    return sum + unitPrice * item.quantity;
  }, 0);
}

function normalizeOrder(order) {
  const items = Array.isArray(order.items)
    ? order.items.map((item) => {
        const product = productById(item.productId);
        return {
          productId: item.productId,
          quantity: Math.max(0, Number(item.quantity || 0)),
          unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : Number(product?.price || 0),
        };
      }).filter((item) => item.quantity > 0)
    : [];
  const normalizedOrder = { ...order, items };
  const total = orderTotal(normalizedOrder);
  let amountPaid = Number(order.amountPaid);
  if (!Number.isFinite(amountPaid)) {
    amountPaid = order.paymentStatus === "Paid" ? total : 0;
  }
  return {
    ...normalizedOrder,
    paymentStatus: PAYMENT_STATUSES.includes(order.paymentStatus) ? order.paymentStatus : "Unpaid",
    productionStatus: PRODUCTION_STATUSES.includes(order.productionStatus) ? order.productionStatus : "Waiting For Batch",
    amountPaid: Math.max(0, Math.min(total, amountPaid)),
    customerNotes: order.customerNotes || "",
    remarks: order.remarks || "",
  };
}

function amountPaid(order) {
  return Math.max(0, Math.min(orderTotal(order), Number(order.amountPaid || 0)));
}

function outstandingAmount(order) {
  return Math.max(0, orderTotal(order) - amountPaid(order));
}

function paymentStatusForAmount(order, explicitStatus = order.paymentStatus) {
  const paid = amountPaid(order);
  const total = orderTotal(order);
  if (paid <= 0) return "Unpaid";
  if (paid >= total) return "Paid";
  return explicitStatus === "Paid" ? "Deposit Paid" : "Deposit Paid";
}

function normalizePhoneForWhatsApp(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return `60${digits.slice(1)}`;
  return digits;
}

function whatsappUrl(order) {
  const number = normalizePhoneForWhatsApp(order.phone);
  const message = encodeURIComponent(`Hi ${order.customerName}, this is Jane from Tastory about your granola order ${order.id}.`);
  return number ? `https://wa.me/${number}?text=${message}` : "";
}

function nextProductionStatus(status) {
  const index = QUICK_PRODUCTION_WORKFLOW.indexOf(status);
  if (status === "New Order") return QUICK_PRODUCTION_WORKFLOW[0];
  if (index === -1 || index === QUICK_PRODUCTION_WORKFLOW.length - 1) return "";
  return QUICK_PRODUCTION_WORKFLOW[index + 1];
}

function itemCount(order) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function isActive(order) {
  return !["Delivered", "Closed"].includes(order.productionStatus);
}

function productionColor(status) {
  const colors = {
    "New Order": "bg-blue-50 text-blue-700",
    "Waiting For Batch": "bg-amber-50 text-amber-700",
    "Scheduled For Baking": "bg-violet-50 text-violet-700",
    Baking: "bg-orange-50 text-orange-700",
    Packed: "bg-cyan-50 text-cyan-700",
    "Ready For Delivery": "bg-emerald-50 text-emerald-700",
    Delivered: "bg-slate-100 text-slate-700",
    Closed: "bg-stone-100 text-stone-500",
  };
  return colors[status] || "bg-stone-100 text-stone-700";
}

function paymentColor(status) {
  return {
    Unpaid: "bg-red-50 text-red-700",
    "Deposit Paid": "bg-amber-50 text-amber-700",
    Paid: "bg-emerald-50 text-emerald-700",
  }[status];
}

function header(title, eyebrow, action = "") {
  return `
    <header class="px-5 pb-5 pt-7 md:px-8">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-orange">${eyebrow}</p>
          <h1 class="text-2xl font-extrabold tracking-tight text-forest">${title}</h1>
        </div>
        ${action}
      </div>
    </header>
  `;
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function dailyOrders(dateKey = localDateKey()) {
  return state.orders.filter((order) => localDateKey(order.createdAt) === dateKey);
}

function orderOverview(orders = dailyOrders()) {
  return {
    total: orders.length,
    pending: orders.filter((order) => ["New Order", "Waiting For Batch"].includes(order.productionStatus)).length,
    inProgress: orders.filter((order) => ["Scheduled For Baking", "Baking", "Packed", "Ready For Delivery"].includes(order.productionStatus)).length,
    completed: orders.filter((order) => ["Delivered", "Closed"].includes(order.productionStatus)).length,
    cancelled: orders.filter((order) => order.productionStatus === "Cancelled").length,
  };
}

function overviewMetric(label, value, tone) {
  return `<div class="rounded-2xl ${tone} p-3"><p class="text-2xl font-extrabold">${value}</p><p class="mt-1 text-[11px] font-bold leading-4">${label}</p></div>`;
}

function renderLogin() {
  const resetMode = new URLSearchParams(location.search).get("auth") === "reset";
  return `
    <main class="grid min-h-screen place-items-center px-5 py-10">
      <section class="page-enter w-full max-w-md rounded-3xl bg-white p-6 shadow-soft">
        <div class="mb-6">
          <p class="text-xs font-bold uppercase tracking-[0.18em] text-orange">Tastory OMS</p>
          <h1 class="mt-2 text-2xl font-extrabold text-forest">${resetMode ? "Choose a new password" : "Sign in to Supabase"}</h1>
          <p class="mt-2 text-sm leading-6 text-stone-500">${resetMode
            ? "Update the password for your Tastory account."
            : "Shared orders, pricing, and production updates across devices."}</p>
        </div>
        ${state.cloudError ? `<div class="mb-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">${escapeHtml(state.cloudError)}</div>` : ""}
        ${
          resetMode
            ? `<form id="password-update-form" class="space-y-4">
                <label><span class="label">New password</span><input class="field" name="password" type="password" minlength="10" required autocomplete="new-password" /></label>
                <button class="min-h-12 w-full rounded-xl bg-forest px-5 text-sm font-extrabold text-white" type="submit">Update password</button>
              </form>`
            : `<form id="login-form" class="space-y-4">
                <label><span class="label">Email</span><input class="field" name="email" type="email" required autocomplete="email" value="tastory4u@gmail.com" /></label>
                <label><span class="label">Password</span><input class="field" name="password" type="password" required autocomplete="current-password" /></label>
                <button class="min-h-12 w-full rounded-xl bg-forest px-5 text-sm font-extrabold text-white" type="submit">${state.cloudLoading ? "Signing in..." : "Sign in"}</button>
              </form>
              <button data-reset-password class="mt-4 w-full py-2 text-sm font-bold text-orange">Send password reset email</button>`
        }
        <button data-use-local class="mt-5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm font-bold text-stone-600">Return to LocalStorage mode</button>
      </section>
    </main>
  `;
}

function cloudControlPanel() {
  if (!isCloudMode()) {
    return `
      <section class="rounded-3xl border border-stone-200 bg-white p-5 shadow-soft">
        <p class="text-xs font-bold uppercase tracking-[0.14em] text-orange">Data mode</p>
        <h2 class="mt-1 text-lg font-extrabold text-forest">LocalStorage is active</h2>
        <p class="mt-2 text-xs leading-5 text-stone-500">This device keeps working exactly as before. Activate Supabase when you are ready to use shared data.</p>
        <button data-use-cloud class="mt-4 min-h-11 w-full rounded-xl bg-forest px-4 text-sm font-extrabold text-white">Sign in to Supabase</button>
      </section>
    `;
  }
  return `
    <section class="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Supabase connected</p>
          <h2 class="mt-1 text-lg font-extrabold text-forest">Shared business data</h2>
          <p class="mt-1 text-xs text-emerald-800">${escapeHtml(state.cloudSession?.user?.email || "")}</p>
        </div>
        <span class="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-extrabold text-white">LIVE</span>
      </div>
      <div class="mt-4 grid grid-cols-2 gap-2">
        <button data-import-local class="min-h-11 rounded-xl bg-forest px-3 text-xs font-extrabold text-white">Backup & Import Local Data</button>
        <button data-use-local class="min-h-11 rounded-xl border border-emerald-300 bg-white px-3 text-xs font-extrabold text-emerald-800">Use LocalStorage</button>
      </div>
      <button data-sign-out class="mt-2 min-h-10 w-full text-xs font-bold text-stone-500">Sign out</button>
    </section>
  `;
}

function bottomNav() {
  const items = [
    ["dashboard", "Dashboard", "dashboard"],
    ["new-order", "New Order", "add"],
    ["orders", "Orders", "orders"],
    ["production", "Production", "production"],
  ].filter(([page]) => page !== "new-order" || canUse("createOrder"));
  return `
    <nav class="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-3xl border-t border-stone-200 bg-white/95 px-2 pt-2 backdrop-blur">
      <div class="grid" style="grid-template-columns: repeat(${items.length}, minmax(0, 1fr))">
        ${items
          .map(([page, label, iconName]) => {
            const active = state.page === page;
            return `
              <button data-nav="${page}" class="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 ${
                active ? "text-forest" : "text-stone-400"
              }" aria-label="${label}" ${active ? 'aria-current="page"' : ""}>
                <span class="${active ? "rounded-xl bg-sage px-3 py-1" : "px-3 py-1"}">${icon(iconName, "h-5 w-5")}</span>
                <span class="text-[10px] font-bold">${label}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </nav>
  `;
}

function renderDashboard() {
  const active = state.orders.filter(isActive);
  const ready = active.filter((order) => order.productionStatus === "Ready For Delivery");
  const unpaid = active.filter((order) => outstandingAmount(order) > 0);
  const dueSoon = active
    .filter((order) => order.latestDeliveryDate)
    .sort((a, b) => a.latestDeliveryDate.localeCompare(b.latestDeliveryDate))
    .slice(0, 4);
  const revenue = state.orders.reduce((sum, order) => sum + amountPaid(order), 0);
  const outstanding = active.reduce((sum, order) => sum + outstandingAmount(order), 0);
  const todayOrders = dailyOrders();
  const overview = orderOverview(todayOrders);

  return `
    ${header("Good morning, Jane", "Tastory OMS", `
      <div class="grid h-11 w-11 place-items-center rounded-full bg-forest font-extrabold text-white shadow-soft">J</div>
    `)}
    <main class="page-enter space-y-6 px-5 md:px-8">
      ${cloudControlPanel()}
      <section class="overflow-hidden rounded-3xl bg-forest p-5 text-white shadow-soft">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm text-white/70">Orders in progress</p>
            <p class="mt-1 text-4xl font-extrabold">${active.length}</p>
          </div>
          <div class="rounded-2xl bg-white/10 p-3">${icon("bag", "h-6 w-6")}</div>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
          <div>
            <p class="text-xs text-white/60">Ready to deliver</p>
            <p class="mt-1 text-lg font-bold">${ready.length}</p>
          </div>
          <div>
            <p class="text-xs text-white/60">Amount collected</p>
            <p class="mt-1 text-lg font-bold">${formatMoney(revenue)}</p>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-2 gap-3">
        ${canUse("createOrder") ? `<button data-nav="new-order" class="rounded-2xl bg-orange p-4 text-left text-white shadow-soft">
          <span class="mb-7 inline-grid h-9 w-9 place-items-center rounded-xl bg-white/20">${icon("add", "h-5 w-5")}</span>
          <span class="block text-sm font-extrabold">Create order</span>
          <span class="text-xs text-white/75">Add a new customer order</span>
        </button>` : `<div class="rounded-2xl bg-stone-100 p-4 text-left text-stone-500 shadow-soft">
          <span class="mb-7 inline-grid h-9 w-9 place-items-center rounded-xl bg-white">${icon("orders", "h-5 w-5")}</span>
          <span class="block text-sm font-extrabold">Assigned orders</span>
          <span class="text-xs">Your production queue</span>
        </div>`}
        <button data-nav="production" class="rounded-2xl bg-sage p-4 text-left text-forest shadow-soft">
          <span class="mb-7 inline-grid h-9 w-9 place-items-center rounded-xl bg-white/60">${icon("production", "h-5 w-5")}</span>
          <span class="block text-sm font-extrabold">Plan production</span>
          <span class="text-xs text-forest/65">See what needs baking</span>
        </button>
      </section>

      <section class="grid grid-cols-2 gap-3">
        <button data-export-excel class="rounded-2xl bg-white p-4 text-left text-forest shadow-soft">
          <span class="block text-sm font-extrabold">Export to Excel</span>
          <span class="mt-1 block text-xs text-stone-500">Choose where to save today's file</span>
        </button>
        <button data-auto-export class="rounded-2xl bg-white p-4 text-left text-forest shadow-soft">
          <span class="block text-sm font-extrabold">Auto Export</span>
          <span class="mt-1 block text-xs text-stone-500">${appSettings.exportFolderName ? "Save to " + escapeHtml(appSettings.exportFolderName) : "Set default folder first"}</span>
        </button>
      </section>

      <section class="rounded-3xl bg-white p-5 shadow-soft">
        <div class="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-extrabold text-forest">Order Overview</h2>
            <p class="text-xs text-stone-500">Today - ${formatDate(localDateKey(), { year: true })}</p>
          </div>
          <button data-nav="summary" class="rounded-xl bg-forest px-3 py-2 text-xs font-extrabold text-white">View All Orders</button>
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          ${overviewMetric("Total orders today", overview.total, "bg-sage text-forest")}
          ${overviewMetric("Pending", overview.pending, "bg-amber-50 text-amber-700")}
          ${overviewMetric("In progress", overview.inProgress, "bg-orange-50 text-orange-700")}
          ${overviewMetric("Completed", overview.completed, "bg-emerald-50 text-emerald-700")}
          ${overviewMetric("Cancelled", overview.cancelled, "bg-red-50 text-red-700")}
        </div>
      </section>

      <section class="grid grid-cols-2 gap-3">
        <button data-set-export-folder class="rounded-2xl border border-stone-200 bg-white p-4 text-left text-forest shadow-soft">
          <span class="block text-sm font-extrabold">Set Export Folder</span>
          <span class="mt-1 block text-xs text-stone-500">${appSettings.exportFolderName ? escapeHtml(appSettings.exportFolderName) : "Choose default folder"}</span>
        </button>
        ${canUse("managePricing") ? `<button data-nav="pricing" class="rounded-2xl border border-stone-200 bg-white p-4 text-left text-forest shadow-soft">
          <span class="block text-sm font-extrabold">Manage Pricing</span>
          <span class="mt-1 block text-xs text-stone-500">Edit products and pack sizes</span>
        </button>` : `<div class="rounded-2xl border border-stone-200 bg-white p-4 text-left text-stone-400 shadow-soft">
          <span class="block text-sm font-extrabold">Shared pricing</span>
          <span class="mt-1 block text-xs">Managed by an administrator</span>
        </div>`}
      </section>
      ${isCloudMode() && canUse("manageStaff") ? `<section>
        <button data-nav="staff" class="w-full rounded-2xl border border-stone-200 bg-white p-4 text-left text-forest shadow-soft">
          <span class="block text-sm font-extrabold">Staff Management</span>
          <span class="mt-1 block text-xs text-stone-500">Invite staff, manage roles, and review pending invitations</span>
        </button>
      </section>` : ""}
      <section>
        <div class="mb-3 flex items-end justify-between">
          <div>
            <h2 class="text-lg font-extrabold text-forest">Coming up</h2>
            <p class="text-xs text-stone-500">Nearest delivery dates</p>
          </div>
          <button data-nav="orders" class="text-xs font-bold text-orange">View all</button>
        </div>
        <div class="space-y-3">
          ${
            dueSoon.length
              ? dueSoon.map(orderCard).join("")
              : emptyState("You are all caught up", "New orders will appear here.")
          }
        </div>
      </section>

      ${
        unpaid.length
          ? `<section class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div class="flex gap-3">
                <div class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 font-extrabold text-amber-700">${unpaid.length}</div>
                <div>
                  <p class="text-sm font-extrabold text-amber-900">Payment follow-up</p>
                  <p class="mt-0.5 text-xs leading-5 text-amber-800">${unpaid.length} active ${
                    unpaid.length === 1 ? "order needs" : "orders need"
                  } payment attention. Outstanding: ${formatMoney(outstanding)}.</p>
                </div>
              </div>
            </section>`
          : ""
      }
    </main>
  `;
}

function orderCard(order) {
  const nextStatus = nextProductionStatus(order.productionStatus);
  const waUrl = whatsappUrl(order);
  return `
    <article class="rounded-2xl border border-stone-100 bg-white p-4 shadow-soft">
      <button data-order-id="${order.id}" class="w-full text-left transition active:scale-[0.99]">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="truncate text-sm font-extrabold text-ink">${escapeHtml(order.customerName)}</p>
              <span class="shrink-0 text-[10px] font-bold text-stone-400">${order.id}</span>
            </div>
            <p class="mt-1 text-xs text-stone-500">${itemCount(order)} items - ${formatMoney(orderTotal(order))}</p>
            <p class="mt-1 text-xs font-bold ${outstandingAmount(order) > 0 ? "text-red-600" : "text-emerald-700"}">Outstanding: ${formatMoney(outstandingAmount(order))}</p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <span class="max-w-28 truncate rounded-full px-2.5 py-1 text-[10px] font-bold ${productionColor(order.productionStatus)} sm:max-w-none">${order.productionStatus}</span>
            <span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${paymentColor(order.paymentStatus)}">${order.paymentStatus}</span>
          </div>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
          <span class="flex items-center gap-1.5 text-xs font-semibold text-stone-600">${icon("calendar", "h-3.5 w-3.5 text-orange")} ${formatDate(order.latestDeliveryDate)}</span>
          <span class="flex items-center text-stone-300">${icon("chevron", "h-4 w-4")}</span>
        </div>
      </button>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <a href="${waUrl || "#"}" target="_blank" rel="noopener" data-whatsapp-order="${order.id}" class="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 text-xs font-extrabold text-white ${waUrl ? "" : "pointer-events-none opacity-50"}">
          ${icon("whatsapp", "h-4 w-4")} WhatsApp
        </a>
        ${
          nextStatus && canUse("updateProduction")
            ? `<button data-advance-status="${order.id}" class="min-h-11 rounded-xl bg-forest px-3 text-xs font-extrabold text-white">Next: ${nextStatus}</button>`
            : `<button class="min-h-11 rounded-xl bg-stone-100 px-3 text-xs font-extrabold text-stone-400" disabled>Workflow done</button>`
        }
      </div>
    </article>
  `;
}
function emptyState(title, text) {
  return `
    <div class="rounded-2xl border border-dashed border-stone-300 bg-white/50 px-5 py-10 text-center">
      <p class="text-sm font-extrabold text-forest">${title}</p>
      <p class="mt-1 text-xs text-stone-500">${text}</p>
    </div>
  `;
}

function options(values, selected) {
  return values
    .map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`)
    .join("");
}

function renderNewOrder() {
  return `
    ${header(state.editingId ? "Edit Order" : "New Order", state.editingId || "Create order", state.editingId ? `
      <button data-cancel-edit class="rounded-xl bg-white px-3 py-2 text-xs font-bold text-stone-600 shadow-soft">Cancel</button>
    ` : "")}
    <main class="page-enter px-5 md:px-8">
      <form id="order-form" class="space-y-5">
        <section class="rounded-3xl bg-white p-5 shadow-soft">
          <div class="mb-5">
            <p class="text-xs font-bold uppercase tracking-[0.14em] text-orange">01 - Customer</p>
            <h2 class="mt-1 text-lg font-extrabold text-forest">Delivery details</h2>
          </div>
          <div class="space-y-4">
            <label>
              <span class="label">Customer Name *</span>
              <input class="field" name="customerName" required placeholder="e.g. Sarah Lee" autocomplete="name" />
            </label>
            <label>
              <span class="label">Phone Number *</span>
              <input class="field" name="phone" required placeholder="01X-XXX XXXX" inputmode="tel" autocomplete="tel" />
            </label>
            <label>
              <span class="label">Delivery Address *</span>
              <textarea class="field min-h-24 resize-y" name="address" required placeholder="Full delivery address" autocomplete="street-address"></textarea>
            </label>
            <label>
              <span class="label">Latest Delivery Date *</span>
              <input class="field" name="latestDeliveryDate" type="date" required min="${dateOffset(0)}" />
            </label>
          </div>
        </section>

        <section class="rounded-3xl bg-white p-5 shadow-soft">
          <div class="mb-4 flex items-end justify-between">
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.14em] text-orange">02 - Products</p>
              <h2 class="mt-1 text-lg font-extrabold text-forest">Choose granola</h2>
            </div>
            <span id="form-item-count" class="rounded-full bg-sage px-3 py-1 text-xs font-bold text-forest">0 items</span>
          </div>
          <div class="space-y-5">
            ${productFlavors()
              .map((flavor) => {
                const flavorProducts = PRODUCTS.filter((product) => product.flavor === flavor);
                return `
                  <div>
                    <div class="mb-2 flex items-center gap-2">
                      <span class="h-2 w-2 rounded-full ${flavorProducts[0].tone.split(" ")[0]}"></span>
                      <h3 class="text-sm font-extrabold">${flavor}</h3>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      ${flavorProducts
                        .map(
                          (product) => `
                            <div class="rounded-2xl border border-stone-200 p-3">
                              <div class="mb-3 flex items-start justify-between">
                                <div>
                                  <p class="text-sm font-extrabold">${product.size}</p>
                                  <p class="text-[11px] text-stone-500">${formatMoney(product.price)}</p>
                                </div>
                                <span class="rounded-lg px-2 py-1 text-[9px] font-bold ${product.tone}">${product.flavor}</span>
                              </div>
                              <div class="flex items-center justify-between rounded-xl bg-cream p-1">
                                <button type="button" data-qty-change="-1" data-product="${product.id}" class="grid h-8 w-8 place-items-center rounded-lg bg-white text-lg font-bold text-forest shadow-sm" aria-label="Remove one ${product.flavor} ${product.size}">-</button>
                                <input class="w-10 bg-transparent text-center text-sm font-extrabold outline-none" data-qty-input name="qty-${product.id}" value="0" min="0" max="99" type="number" inputmode="numeric" aria-label="${product.flavor} ${product.size} quantity" />
                                <button type="button" data-qty-change="1" data-product="${product.id}" class="grid h-8 w-8 place-items-center rounded-lg bg-forest text-lg font-bold text-white shadow-sm" aria-label="Add one ${product.flavor} ${product.size}">+</button>
                              </div>
                            </div>
                          `,
                        )
                        .join("")}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </section>

        <section class="rounded-3xl bg-white p-5 shadow-soft">
          <div class="mb-5">
            <p class="text-xs font-bold uppercase tracking-[0.14em] text-orange">03 - Fulfilment</p>
            <h2 class="mt-1 text-lg font-extrabold text-forest">Payment & delivery</h2>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <label>
              <span class="label">Payment Status</span>
              <select class="field" name="paymentStatus">${options(PAYMENT_STATUSES, "Unpaid")}</select>
            </label>
            <label>
              <span class="label">Payment Method</span>
              <select class="field" name="paymentMethod">${options(PAYMENT_METHODS, "DuitNow")}</select>
            </label>
            <label>
              <span class="label">Amount Paid</span>
              <input class="field" name="amountPaid" value="0" min="0" step="0.01" type="number" inputmode="decimal" placeholder="0.00" />
            </label>
            <label>
              <span class="label">Production Status</span>
              <select class="field" name="productionStatus">${options(PRODUCTION_STATUSES, "New Order")}</select>
            </label>
            <label>
              <span class="label">Delivery Method</span>
              <select class="field" name="deliveryMethod">${options(DELIVERY_METHODS, "Self Delivery")}</select>
            </label>
            <label>
              <span class="label">Delivery Person</span>
              <input class="field" name="deliveryPerson" placeholder="Name, if assigned" />
            </label>
            <label>
              <span class="label">Tracking Number</span>
              <input class="field" name="trackingNumber" placeholder="Courier tracking no." />
            </label>
            <label>
              <span class="label">Actual Delivery Date</span>
              <input class="field" name="actualDeliveryDate" type="date" />
            </label>
            <label>
              <span class="label">Batch ID</span>
              <input class="field" name="batchId" placeholder="e.g. B-2606-04" />
            </label>
          </div>
          <label class="mt-4 block">
            <span class="label">Customer Notes</span>
            <textarea class="field min-h-24 resize-y" name="customerNotes" placeholder="Less sweet, no raisins, call before delivery, leave at guard house..."></textarea>
          </label>
          <label class="mt-4 block">
            <span class="label">Remarks</span>
            <textarea class="field min-h-24 resize-y" name="remarks" placeholder="Internal notes for Jane..."></textarea>
          </label>
        </section>

        <section class="sticky bottom-20 z-20 rounded-2xl border border-stone-200 bg-white/95 p-3 shadow-soft backdrop-blur">
          <div class="flex items-center gap-4">
            <div class="min-w-24 pl-1">
              <p class="text-[10px] font-bold uppercase tracking-wider text-stone-400">Order total</p>
              <p id="form-total" class="text-lg font-extrabold text-forest">${formatMoney(0)}</p>
              <p id="form-outstanding" class="text-[11px] font-bold text-red-600">Outstanding: ${formatMoney(0)}</p>
            </div>
            <button class="min-h-12 flex-1 rounded-xl bg-orange px-5 text-sm font-extrabold text-white shadow-sm" type="submit">
              ${state.editingId ? "Save Changes" : "Create Order"}
            </button>
          </div>
        </section>
      </form>
    </main>
  `;
}

function renderOrders() {
  const query = state.orderSearch.toLowerCase().trim();
  const filtered = state.orders
    .filter((order) => {
      if (state.orderFilter === "Active" && !isActive(order)) return false;
      if (state.orderFilter === "Completed" && isActive(order)) return false;
      if (!query) return true;
      return [order.customerName, order.phone, order.id, order.batchId, order.customerNotes, order.remarks]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return `
    ${header("Orders", `${state.orders.length} total`, `
      ${canUse("createOrder") ? `<button data-nav="new-order" class="grid h-11 w-11 place-items-center rounded-xl bg-orange text-white shadow-soft" aria-label="Create new order">${icon("add")}</button>` : ""}
    `)}
    <main class="page-enter px-5 md:px-8">
      <div class="relative">
        <span class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">${icon("search", "h-5 w-5")}</span>
        <input id="order-search" class="field pl-12" type="search" value="${escapeHtml(state.orderSearch)}" placeholder="Search customer, phone or order ID" />
      </div>
      <div class="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-2">
        ${["Active", "All", "Completed"]
          .map(
            (filter) => `
              <button data-order-filter="${filter}" class="shrink-0 rounded-full px-4 py-2 text-xs font-bold ${
                state.orderFilter === filter ? "bg-forest text-white" : "border border-stone-200 bg-white text-stone-600"
              }">${filter}</button>
            `,
          )
          .join("")}
      </div>
      <div class="mt-3 space-y-3" id="order-list">
        ${filtered.length ? filtered.map(orderCard).join("") : emptyState("No matching orders", "Try another search or filter.")}
      </div>
    </main>
  `;
}

function renderProduction() {
  const productionOrders = state.orders.filter(isActive);
  const totals = PRODUCTS.map((product) => {
    const quantity = productionOrders.reduce((sum, order) => {
      const item = order.items.find((entry) => entry.productId === product.id);
      return sum + (item?.quantity || 0);
    }, 0);
    return { ...product, quantity };
  });
  const stages = ["Waiting For Batch", "Scheduled For Baking", "Baking", "Packed", "Ready For Delivery"];

  return `
    ${header("Production", "Kitchen overview")}
    <main class="page-enter space-y-6 px-5 md:px-8">
      <section class="rounded-3xl bg-forest p-5 text-white shadow-soft">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm text-white/65">Total units in active orders</p>
            <p class="mt-1 text-4xl font-extrabold">${totals.reduce((sum, item) => sum + item.quantity, 0)}</p>
          </div>
          <span class="rounded-xl bg-white/10 p-3">${icon("production", "h-6 w-6")}</span>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/10 pt-4">
          <div>
            <p class="text-xs text-white/55">35g packs</p>
            <p class="font-extrabold">${totals.filter((item) => item.size === "35g").reduce((sum, item) => sum + item.quantity, 0)}</p>
          </div>
          <div>
            <p class="text-xs text-white/55">150g packs</p>
            <p class="font-extrabold">${totals.filter((item) => item.size === "150g").reduce((sum, item) => sum + item.quantity, 0)}</p>
          </div>
        </div>
      </section>

      <section>
        <div class="mb-3">
          <h2 class="text-lg font-extrabold text-forest">Product totals</h2>
          <p class="text-xs text-stone-500">All active orders combined</p>
        </div>
        <div class="overflow-hidden rounded-2xl bg-white shadow-soft">
          ${productFlavors()
            .map((flavor, index) => {
              const products = totals.filter((product) => product.flavor === flavor);
              const total = products.reduce((sum, product) => sum + product.quantity, 0);
              return `
                <div class="flex items-center gap-3 p-4 ${index ? "border-t border-stone-100" : ""}">
                  <span class="grid h-10 w-10 place-items-center rounded-xl ${products[0].tone} font-extrabold">${flavor[0]}</span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-extrabold">${flavor}</p>
                    <p class="text-xs text-stone-500">${products.map((product) => `${product.size}: ${product.quantity}`).join(" - ")}</p>
                  </div>
                  <span class="text-xl font-extrabold text-forest">${total}</span>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>

      <section>
        <div class="mb-3">
          <h2 class="text-lg font-extrabold text-forest">Production pipeline</h2>
          <p class="text-xs text-stone-500">Orders grouped by current stage</p>
        </div>
        <div class="space-y-3">
          ${stages
            .map((stage) => {
              const stageOrders = productionOrders.filter((order) => order.productionStatus === stage);
              return `
                <div class="rounded-2xl bg-white p-4 shadow-soft">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="status-dot ${productionColor(stage).split(" ")[0]}"></span>
                      <p class="text-sm font-extrabold">${stage}</p>
                    </div>
                    <span class="rounded-full bg-cream px-2.5 py-1 text-xs font-extrabold text-forest">${stageOrders.length}</span>
                  </div>
                  ${
                    stageOrders.length
                      ? `<div class="mt-3 space-y-2 border-t border-stone-100 pt-3">
                          ${stageOrders
                            .map(
                              (order) => `
                                <button data-order-id="${order.id}" class="flex w-full items-center justify-between py-1 text-left">
                                  <span>
                                    <span class="block text-xs font-bold">${escapeHtml(order.customerName)}</span>
                                    <span class="text-[10px] text-stone-400">${order.batchId ? escapeHtml(order.batchId) : "No batch"} - ${itemCount(order)} items</span>
                                  </span>
                                  ${icon("chevron", "h-4 w-4 text-stone-300")}
                                </button>
                              `,
                            )
                            .join("")}
                        </div>`
                      : `<p class="mt-2 text-xs text-stone-400">No orders at this stage.</p>`
                  }
                </div>
              `;
            })
            .join("")}
        </div>
      </section>
    </main>
  `;
}

function renderSummary() {
  const orders = dailyOrders().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const overview = orderOverview(orders);
  return `
    ${header("Daily Summary", "Today", `<button data-nav="dashboard" class="rounded-xl bg-white px-3 py-2 text-xs font-bold text-stone-600 shadow-soft">Back</button>`)}
    <main class="page-enter space-y-5 px-5 md:px-8">
      <section class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        ${overviewMetric("Total", overview.total, "bg-sage text-forest")}
        ${overviewMetric("Pending", overview.pending, "bg-amber-50 text-amber-700")}
        ${overviewMetric("In progress", overview.inProgress, "bg-orange-50 text-orange-700")}
        ${overviewMetric("Completed", overview.completed, "bg-emerald-50 text-emerald-700")}
        ${overviewMetric("Cancelled", overview.cancelled, "bg-red-50 text-red-700")}
      </section>
      <section class="space-y-3">
        ${orders.length ? orders.map((order) => `
          <article class="rounded-2xl bg-white p-4 shadow-soft">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-extrabold text-ink">${escapeHtml(order.customerName)}</p>
                <p class="mt-1 text-xs text-stone-500">${order.id} - ${itemCount(order)} items - ${formatMoney(orderTotal(order))}</p>
              </div>
              <span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${productionColor(order.productionStatus)}">${order.productionStatus}</span>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div><span class="text-stone-400">Paid</span><p class="font-bold">${formatMoney(amountPaid(order))}</p></div>
              <div><span class="text-stone-400">Outstanding</span><p class="font-bold ${outstandingAmount(order) > 0 ? "text-red-600" : "text-emerald-700"}">${formatMoney(outstandingAmount(order))}</p></div>
            </div>
            ${order.customerNotes ? `<p class="mt-3 rounded-xl bg-cream p-3 text-xs text-stone-600">${escapeHtml(order.customerNotes)}</p>` : ""}
          </article>
        `).join("") : emptyState("No orders today", "Daily orders created today will appear here.")}
      </section>
    </main>
  `;
}

function renderPricing() {
  return `
    ${header("Pricing", "Product settings", `<button data-nav="dashboard" class="rounded-xl bg-white px-3 py-2 text-xs font-bold text-stone-600 shadow-soft">Back</button>`)}
    <main class="page-enter px-5 md:px-8">
      <form id="pricing-form" class="space-y-4">
        <section class="rounded-3xl bg-white p-5 shadow-soft">
          <div class="mb-4">
            <h2 class="text-lg font-extrabold text-forest">Granola Prices</h2>
            <p class="text-xs text-stone-500">Changes are saved in application settings and used for new orders.</p>
          </div>
          <div id="pricing-list" class="space-y-3">
            ${PRODUCTS.map((product, index) => pricingRow(product, index)).join("")}
          </div>
          <button type="button" data-add-product class="mt-4 min-h-11 w-full rounded-xl border border-dashed border-stone-300 bg-cream px-4 text-sm font-extrabold text-forest">Add Product / Size</button>
        </section>
        <section class="sticky bottom-20 z-20 rounded-2xl border border-stone-200 bg-white/95 p-3 shadow-soft backdrop-blur">
          <button class="min-h-12 w-full rounded-xl bg-orange px-5 text-sm font-extrabold text-white" type="submit">Save Pricing</button>
        </section>
      </form>
    </main>
  `;
}

function staffStatusBadge(status) {
  const styles = {
    active: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    inactive: "bg-stone-200 text-stone-700",
  };
  const labels = {
    active: "Active",
    pending: "Pending Invitation",
    inactive: "Inactive",
  };
  return `<span class="rounded-full px-2.5 py-1 text-[10px] font-extrabold ${styles[status] || styles.inactive}">${labels[status] || status}</span>`;
}

function staffRoleOptions(selected) {
  return STAFF_ROLES.map((role) =>
    `<option value="${role.code}" ${role.code === selected ? "selected" : ""}>${role.name}</option>`
  ).join("");
}

function staffCard(member) {
  const pending = member.status === "pending";
  return `
    <article class="rounded-2xl border border-stone-100 bg-white p-4 shadow-soft">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-extrabold text-ink">${escapeHtml(member.full_name || member.email)}</h3>
            ${member.is_current_user ? '<span class="rounded-full bg-sage px-2 py-0.5 text-[9px] font-extrabold text-forest">YOU</span>' : ""}
          </div>
          <p class="mt-1 break-all text-xs text-stone-500">${escapeHtml(member.email)}</p>
        </div>
        ${staffStatusBadge(member.status)}
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <label>
          <span class="label">Role</span>
          <select class="field" data-staff-role="${member.user_id}" ${member.user_id ? "" : "disabled"}>
            ${staffRoleOptions(member.role_code)}
          </select>
        </label>
        <div class="rounded-xl bg-cream p-3 text-xs">
          <p class="font-bold text-stone-500">${pending ? "Invitation sent" : "Last login"}</p>
          <p class="mt-1 font-extrabold text-forest">${formatDateTime(pending ? member.invited_at : member.last_login_at)}</p>
        </div>
      </div>
      <p class="mt-3 text-xs leading-5 text-stone-500">${escapeHtml(STAFF_ROLES.find((role) => role.code === member.role_code)?.description || "")}</p>
      ${pending ? `
        <div class="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          <p class="font-extrabold">Acceptance status: Waiting for staff member</p>
          <p class="mt-1">The account is assigned to Tastory but remains pending until the invitation is accepted.</p>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button data-resend-invitation="${member.invitation_id}" class="min-h-11 rounded-xl bg-forest px-3 text-xs font-extrabold text-white">Resend</button>
          <button data-cancel-invitation="${member.invitation_id}" class="min-h-11 rounded-xl border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600">Cancel</button>
        </div>
      ` : `
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button data-toggle-staff="${member.user_id}" data-active="${member.status === "active"}" ${member.is_current_user ? "disabled" : ""} class="min-h-11 rounded-xl px-3 text-xs font-extrabold ${member.status === "active" ? "border border-amber-200 bg-amber-50 text-amber-800" : "bg-forest text-white"} disabled:opacity-40">
            ${member.status === "active" ? "Disable" : "Reactivate"}
          </button>
          <button data-remove-staff="${member.user_id}" ${member.is_current_user ? "disabled" : ""} class="min-h-11 rounded-xl border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 disabled:opacity-40">Remove</button>
        </div>
      `}
    </article>
  `;
}

function renderStaff() {
  const filters = [
    ["all", "All Staff"],
    ["active", "Active"],
    ["pending", "Pending"],
    ["inactive", "Inactive"],
  ];
  const filtered = state.staff.filter((member) =>
    state.staffFilter === "all" || member.status === state.staffFilter
  );
  const pending = filtered.filter((member) => member.status === "pending");
  const staff = filtered.filter((member) => member.status !== "pending");

  return `
    ${header("Staff Management", "Admin only", `<button data-nav="dashboard" class="rounded-xl bg-white px-3 py-2 text-xs font-bold text-stone-600 shadow-soft">Back</button>`)}
    <main class="page-enter space-y-5 px-5 md:px-8">
      <section class="rounded-3xl bg-white p-5 shadow-soft">
        <div class="mb-4">
          <h2 class="text-lg font-extrabold text-forest">Invite New Staff</h2>
          <p class="text-xs leading-5 text-stone-500">The invitation automatically assigns Tastory, the selected role, and the correct active business.</p>
        </div>
        <form id="staff-invite-form" class="space-y-4">
          <label><span class="label">Full Name</span><input class="field" name="fullName" required autocomplete="name" /></label>
          <label><span class="label">Email</span><input class="field" name="email" type="email" required autocomplete="email" /></label>
          <label>
            <span class="label">Role</span>
            <select class="field" name="role">${staffRoleOptions("sales_staff")}</select>
          </label>
          <div id="invite-role-description" class="rounded-xl bg-sage p-3 text-xs leading-5 text-forest">${STAFF_ROLES.find((role) => role.code === "sales_staff").description}</div>
          <button class="min-h-12 w-full rounded-xl bg-orange px-5 text-sm font-extrabold text-white" type="submit">Send Invitation</button>
        </form>
      </section>

      <section>
        <div class="hide-scrollbar flex gap-2 overflow-x-auto pb-2">
          ${filters.map(([value, label]) => `<button data-staff-filter="${value}" class="shrink-0 rounded-full px-4 py-2 text-xs font-bold ${state.staffFilter === value ? "bg-forest text-white" : "border border-stone-200 bg-white text-stone-600"}">${label}</button>`).join("")}
        </div>
      </section>

      ${state.staffLoading && !state.staffLoaded ? emptyState("Loading staff", "Checking Tastory staff and invitations.") : ""}
      ${pending.length ? `<section>
        <div class="mb-3">
          <h2 class="text-lg font-extrabold text-forest">Pending Invitations</h2>
          <p class="text-xs text-stone-500">${pending.length} waiting for acceptance</p>
        </div>
        <div class="space-y-3">${pending.map(staffCard).join("")}</div>
      </section>` : ""}
      ${staff.length ? `<section>
        <div class="mb-3">
          <h2 class="text-lg font-extrabold text-forest">Staff</h2>
          <p class="text-xs text-stone-500">Active and inactive Tastory members</p>
        </div>
        <div class="space-y-3">${staff.map(staffCard).join("")}</div>
      </section>` : ""}
      ${state.staffLoaded && !filtered.length ? emptyState("No staff in this filter", "Choose another status or invite a staff member.") : ""}
    </main>
  `;
}

function pricingRow(product, index) {
  return `
    <div class="rounded-2xl border border-stone-200 p-3" data-pricing-row>
      <input type="hidden" name="product-id" value="${escapeHtml(product.id)}" />
      <div class="grid grid-cols-[1fr_0.8fr] gap-2">
        <label><span class="label">Flavor</span><input class="field" name="product-flavor" value="${escapeHtml(product.flavor)}" required /></label>
        <label><span class="label">Size</span><input class="field" name="product-size" value="${escapeHtml(product.size)}" required placeholder="250g" /></label>
      </div>
      <div class="mt-2 grid grid-cols-[1fr_auto] gap-2">
        <label><span class="label">Price (RM)</span><input class="field" name="product-price" type="number" min="0" step="0.01" value="${product.price}" required /></label>
        <button type="button" data-remove-product class="mt-6 grid h-11 w-11 place-items-center rounded-xl border border-red-200 bg-white text-red-600" aria-label="Remove product">${icon("trash", "h-4 w-4")}</button>
      </div>
    </div>
  `;
}
const EXPORT_DB_NAME = "tastory-oms-export-handles";
const EXPORT_STORE_NAME = "handles";

function exportFileName(dateKey = localDateKey()) {
  return `DailyOrders_${dateKey}.xlsx`;
}

function dailyOrderRows() {
  return dailyOrders().map((order) => ({
    "Order ID": order.id,
    "Customer": order.customerName,
    "Phone": order.phone,
    "Delivery Address": order.address,
    "Latest Delivery Date": order.latestDeliveryDate,
    "Production Status": order.productionStatus,
    "Payment Status": order.paymentStatus,
    "Payment Method": order.paymentMethod,
    "Order Total": orderTotal(order),
    "Amount Paid": amountPaid(order),
    "Outstanding": outstandingAmount(order),
    "Items": order.items.map((item) => `${productLabel(item.productId)} x ${item.quantity} @ ${formatMoney(item.unitPrice ?? productById(item.productId)?.price ?? 0)}`).join("; "),
    "Customer Notes": order.customerNotes,
    "Remarks": order.remarks,
    "Created At": new Date(order.createdAt).toLocaleString("en-MY"),
  }));
}

function xmlEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function columnName(index) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
}

function sheetXml(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : ["Order ID", "Customer", "Order Total", "Amount Paid", "Outstanding"];
  const allRows = [headers, ...rows.map((row) => headers.map((header) => row[header]))];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${allRows
    .map((row, rowIndex) => `<row r="${rowIndex + 1}">${row
      .map((cell, columnIndex) => {
        const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
        return typeof cell === "number"
          ? `<c r="${ref}"><v>${cell}</v></c>`
          : `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
      })
      .join("")}</row>`)
    .join("")}</sheetData></worksheet>`;
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function u16(value) { return [value & 255, (value >>> 8) & 255]; }
function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }

function createZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array([0x50,0x4b,0x03,0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...name, ...data]);
    chunks.push(local);
    central.push(new Uint8Array([0x50,0x4b,0x01,0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    offset += local.length;
  });
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array([0x50,0x4b,0x05,0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  return new Blob([...chunks, ...central, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function createXlsxBlob(rows) {
  return createZip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Daily Orders" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml(rows) },
  ]);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function openExportDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EXPORT_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(EXPORT_STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirectoryHandle(handle) {
  const db = await openExportDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXPORT_STORE_NAME, "readwrite");
    tx.objectStore(EXPORT_STORE_NAME).put(handle, "directory");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getDirectoryHandle() {
  const db = await openExportDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXPORT_STORE_NAME, "readonly");
    const request = tx.objectStore(EXPORT_STORE_NAME).get("directory");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function setDefaultExportFolder() {
  if (!window.showDirectoryPicker) {
    showToast("This browser does not support default export folders. Use Export to Excel instead.", "error");
    return;
  }
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await saveDirectoryHandle(handle);
  appSettings.exportFolderName = handle.name;
  saveSettings();
  showToast(`Default export folder set to ${handle.name}.`);
  render();
}

async function exportDailyOrders(auto = false) {
  const rows = dailyOrderRows();
  const blob = createXlsxBlob(rows);
  const fileName = exportFileName();
  try {
    if (auto) {
      if (!window.showDirectoryPicker) {
        downloadBlob(blob, fileName);
        showToast("Auto folder is not supported here. Download started instead.");
        return;
      }
      let handle = await getDirectoryHandle();
      if (!handle) {
        await setDefaultExportFolder();
        handle = await getDirectoryHandle();
      }
      const permission = await handle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") throw new Error("Folder permission was not granted.");
      const fileHandle = await handle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToast(`${fileName} saved to ${handle.name}.`);
      return;
    }
    if (window.showSaveFilePicker) {
      const fileHandle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: "Excel Workbook", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }] });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToast(`${fileName} exported.`);
    } else {
      downloadBlob(blob, fileName);
      showToast(`${fileName} download started.`);
    }
  } catch (error) {
    if (error.name !== "AbortError") showToast(error.message || "Export failed.", "error");
  }
}
function renderOrderModal(order) {
  const nextStatus = nextProductionStatus(order.productionStatus);
  const waUrl = whatsappUrl(order);
  const products = order.items
    .map((item) => {
      const product = PRODUCTS.find((entry) => entry.id === item.productId);
      return `
        <div class="flex items-center justify-between py-2">
          <div>
            <p class="text-sm font-bold">${escapeHtml(product ? `${product.flavor} ${product.size}` : `${item.productName || "Granola"} ${item.variantName || ""}`)}</p>
            <p class="text-xs text-stone-400">${formatMoney(item.unitPrice ?? product?.price ?? 0)} each</p>
          </div>
          <p class="text-sm font-extrabold">x ${item.quantity}</p>
        </div>
      `;
    })
    .join("");

  return `
    <div id="order-modal" class="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm md:items-center md:p-6">
      <div class="modal-enter max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cream md:rounded-3xl">
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-cream/95 px-5 py-4 backdrop-blur">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-wider text-orange">${order.id}</p>
            <h2 class="text-lg font-extrabold text-forest">${escapeHtml(order.customerName)}</h2>
          </div>
          <button data-close-modal class="grid h-10 w-10 place-items-center rounded-full bg-white text-stone-500 shadow-sm" aria-label="Close">${icon("close")}</button>
        </div>
        <div class="space-y-4 p-5">
          <section class="rounded-2xl bg-white p-4 shadow-soft">
            <div class="mb-3 flex flex-wrap gap-2">
              <span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${productionColor(order.productionStatus)}">${order.productionStatus}</span>
              <span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${paymentColor(order.paymentStatus)}">${order.paymentStatus}</span>
            </div>
            <a href="tel:${escapeHtml(order.phone)}" class="flex items-center gap-2 text-sm font-bold text-forest">${icon("phone", "h-4 w-4 text-orange")} ${escapeHtml(order.phone)}</a>
            <a href="${waUrl || "#"}" target="_blank" rel="noopener" class="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 text-xs font-extrabold text-white ${waUrl ? "" : "pointer-events-none opacity-50"}">
              ${icon("whatsapp", "h-4 w-4")} WhatsApp Customer
            </a>
            <p class="mt-3 text-sm leading-6 text-stone-600">${escapeHtml(order.address)}</p>
            <div class="mt-3 flex items-center gap-2 border-t border-stone-100 pt-3 text-xs font-bold text-stone-600">
              ${icon("calendar", "h-4 w-4 text-orange")} Due ${formatDate(order.latestDeliveryDate, { year: true })}
            </div>
          </section>

          <section class="rounded-2xl bg-white p-4 shadow-soft">
            <h3 class="mb-1 text-sm font-extrabold text-forest">Order items</h3>
            <div class="divide-y divide-stone-100">${products}</div>
            <div class="mt-2 flex items-center justify-between border-t border-stone-200 pt-3">
              <span class="text-xs font-bold text-stone-500">${itemCount(order)} items</span>
              <span class="text-lg font-extrabold text-forest">${formatMoney(orderTotal(order))}</span>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div class="rounded-xl bg-emerald-50 p-3">
                <p class="font-bold text-emerald-700">Amount paid</p>
                <p class="mt-1 text-sm font-extrabold text-emerald-900">${formatMoney(amountPaid(order))}</p>
              </div>
              <div class="rounded-xl bg-red-50 p-3">
                <p class="font-bold text-red-700">Outstanding</p>
                <p class="mt-1 text-sm font-extrabold text-red-900">${formatMoney(outstandingAmount(order))}</p>
              </div>
            </div>
          </section>

          <section class="rounded-2xl bg-white p-4 shadow-soft">
            <h3 class="mb-3 text-sm font-extrabold text-forest">Fulfilment</h3>
            <dl class="grid grid-cols-2 gap-x-3 gap-y-4 text-xs">
              <div><dt class="text-stone-400">Payment status</dt><dd class="mt-1 font-bold">${order.paymentStatus}</dd></div>
              <div><dt class="text-stone-400">Payment method</dt><dd class="mt-1 font-bold">${order.paymentMethod}</dd></div>
              <div><dt class="text-stone-400">Delivery</dt><dd class="mt-1 font-bold">${order.deliveryMethod}</dd></div>
              <div><dt class="text-stone-400">Delivery person</dt><dd class="mt-1 font-bold">${escapeHtml(order.deliveryPerson || "Not assigned")}</dd></div>
              <div><dt class="text-stone-400">Batch ID</dt><dd class="mt-1 font-bold">${escapeHtml(order.batchId || "Not assigned")}</dd></div>
              <div><dt class="text-stone-400">Tracking no.</dt><dd class="mt-1 font-bold">${escapeHtml(order.trackingNumber || "Not available")}</dd></div>
              <div><dt class="text-stone-400">Delivered on</dt><dd class="mt-1 font-bold">${formatDate(order.actualDeliveryDate)}</dd></div>
            </dl>
            ${order.customerNotes ? `<div class="mt-4 rounded-xl bg-sage p-3 text-xs leading-5 text-forest"><span class="font-bold">Customer notes: </span>${escapeHtml(order.customerNotes)}</div>` : ""}
            ${order.remarks ? `<div class="mt-4 rounded-xl bg-cream p-3 text-xs leading-5 text-stone-600"><span class="font-bold text-ink">Remarks: </span>${escapeHtml(order.remarks)}</div>` : ""}
          </section>

          <section class="rounded-2xl bg-white p-4 shadow-soft">
            <p class="label">Quick Production Workflow</p>
            <div class="flex flex-wrap gap-2">
              ${QUICK_PRODUCTION_WORKFLOW.map((status) => {
                const active = status === order.productionStatus;
                const completed = QUICK_PRODUCTION_WORKFLOW.indexOf(status) < QUICK_PRODUCTION_WORKFLOW.indexOf(order.productionStatus);
                return `<span class="rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  active ? productionColor(status) : completed ? "bg-sage text-forest" : "bg-stone-100 text-stone-400"
                }">${status}</span>`;
              }).join("")}
            </div>
            ${
              nextStatus && canUse("updateProduction")
                ? `<button data-modal-advance-status="${order.id}" class="mt-4 min-h-12 w-full rounded-xl bg-forest px-4 text-sm font-extrabold text-white">Move to ${nextStatus}</button>`
                : `<button class="mt-4 min-h-12 w-full rounded-xl bg-stone-100 px-4 text-sm font-extrabold text-stone-400" disabled>Workflow complete</button>`
            }
          </section>

          ${canUse("editOrder") || canUse("archiveOrder") ? `<div class="grid grid-cols-[1fr_auto] gap-3">
            ${canUse("editOrder") ? `<button data-edit-order="${order.id}" class="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-forest px-4 text-sm font-extrabold text-white">${icon("edit", "h-4 w-4")} Edit Order</button>` : "<div></div>"}
            ${canUse("archiveOrder") ? `<button data-delete-order="${order.id}" class="grid min-h-12 w-12 place-items-center rounded-xl border border-red-200 bg-white text-red-600" aria-label="${isCloudMode() ? "Archive" : "Delete"} order">${icon("trash", "h-4 w-4")}</button>` : ""}
          </div>` : ""}
        </div>
      </div>
    </div>
  `;
}

function render() {
  const app = document.querySelector("#app");
  if (isCloudMode() && !state.cloudSession) {
    app.innerHTML = renderLogin();
    bindEvents();
    return;
  }
  if (isCloudMode() && state.cloudSession) {
    if (state.page === "new-order" && !canUse("createOrder")) state.page = "orders";
    if (state.page === "pricing" && !canUse("managePricing")) state.page = "dashboard";
    if (state.page === "staff" && !canUse("manageStaff")) state.page = "dashboard";
  } else if (state.page === "staff") {
    state.page = "dashboard";
  }
  const pages = {
    dashboard: renderDashboard,
    "new-order": renderNewOrder,
    orders: renderOrders,
    production: renderProduction,
    summary: renderSummary,
    pricing: renderPricing,
    staff: renderStaff,
  };
  app.innerHTML = `${pages[state.page]()}${bottomNav()}`;
  bindEvents();
  if (state.page === "new-order" && state.editingId) populateEditForm();
  window.scrollTo({ top: 0, behavior: "instant" });
}

async function navigate(page) {
  state.page = page;
  if (page !== "new-order") state.editingId = null;
  render();
  if (page === "staff" && canUse("manageStaff")) {
    await refreshStaff();
    render();
  }
}

function bindEvents() {
  document.querySelector("#login-form")?.addEventListener("submit", handleLogin);
  document.querySelector("#password-update-form")?.addEventListener("submit", handlePasswordUpdate);
  document.querySelector("[data-reset-password]")?.addEventListener("click", handlePasswordReset);
  document.querySelectorAll("[data-use-local]").forEach((button) => {
    button.addEventListener("click", async () => {
      CLOUD?.unsubscribe();
      CLOUD?.setProvider("local");
      state.cloudSession = null;
      state.cloudRoleCodes = [];
      state.cloudError = "";
      appSettings = loadSettings();
      PRODUCTS = appSettings.products;
      state.orders = loadOrders();
      render();
      showToast("LocalStorage mode restored.");
    });
  });
  document.querySelector("[data-use-cloud]")?.addEventListener("click", () => {
    CLOUD?.setProvider("supabase");
    state.cloudError = "";
    initializeApp();
  });
  document.querySelector("[data-sign-out]")?.addEventListener("click", async () => {
    await CLOUD.signOut();
    state.cloudSession = null;
    state.cloudRoleCodes = [];
    render();
  });
  document.querySelector("[data-import-local]")?.addEventListener("click", importLocalDataToCloud);
  document.querySelector("#staff-invite-form")?.addEventListener("submit", handleStaffInvite);
  document.querySelector("#staff-invite-form [name='role']")?.addEventListener("change", (event) => {
    const role = STAFF_ROLES.find((item) => item.code === event.target.value);
    document.querySelector("#invite-role-description").textContent = role?.description || "";
  });
  document.querySelectorAll("[data-staff-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.staffFilter = button.dataset.staffFilter;
      render();
    });
  });
  document.querySelectorAll("[data-staff-role]").forEach((select) => {
    select.addEventListener("change", () => changeStaffRole(select.dataset.staffRole, select.value));
  });
  document.querySelectorAll("[data-toggle-staff]").forEach((button) => {
    button.addEventListener("click", () => toggleStaffStatus(button.dataset.toggleStaff, button.dataset.active === "true"));
  });
  document.querySelectorAll("[data-remove-staff]").forEach((button) => {
    button.addEventListener("click", () => removeStaffMember(button.dataset.removeStaff));
  });
  document.querySelectorAll("[data-resend-invitation]").forEach((button) => {
    button.addEventListener("click", () => resendStaffInvitation(button.dataset.resendInvitation));
  });
  document.querySelectorAll("[data-cancel-invitation]").forEach((button) => {
    button.addEventListener("click", () => cancelStaffInvitation(button.dataset.cancelInvitation));
  });

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.nav));
  });


  document.querySelector("[data-export-excel]")?.addEventListener("click", () => exportDailyOrders(false));
  document.querySelector("[data-auto-export]")?.addEventListener("click", () => exportDailyOrders(true));
  document.querySelector("[data-set-export-folder]")?.addEventListener("click", setDefaultExportFolder);
  document.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", () => openOrder(button.dataset.orderId));
  });

  document.querySelectorAll("[data-advance-status]").forEach((button) => {
    button.addEventListener("click", () => advanceProductionStatus(button.dataset.advanceStatus));
  });

  document.querySelectorAll("[data-order-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.orderFilter = button.dataset.orderFilter;
      render();
    });
  });

  document.querySelector("#order-search")?.addEventListener("input", (event) => {
    state.orderSearch = event.target.value;
    renderOrderSearchResults();
  });

  const form = document.querySelector("#order-form");
  if (form) {
    form.addEventListener("submit", handleOrderSubmit);
    form.querySelectorAll("[data-qty-change]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = form.querySelector(`[name="qty-${button.dataset.product}"]`);
        input.value = Math.max(0, Math.min(99, Number(input.value || 0) + Number(button.dataset.qtyChange)));
        updateFormTotal();
      });
    });
    form.querySelectorAll("[data-qty-input]").forEach((input) => {
      input.addEventListener("input", () => {
        input.value = Math.max(0, Math.min(99, Number(input.value || 0)));
        updateFormTotal();
      });
    });
    form.elements.amountPaid.addEventListener("input", updateFormTotal);
  }


  const pricingForm = document.querySelector("#pricing-form");
  if (pricingForm) {
    pricingForm.addEventListener("submit", handlePricingSubmit);
    pricingForm.querySelector("[data-add-product]").addEventListener("click", () => {
      const product = normalizeProduct({ flavor: "Classic", size: "250g", price: 0, tone: "bg-amber-100 text-amber-800" }, Date.now());
      document.querySelector("#pricing-list").insertAdjacentHTML("beforeend", pricingRow(product, PRODUCTS.length));
      bindPricingRowButtons();
    });
    bindPricingRowButtons();
  }

  document.querySelector("[data-cancel-edit]")?.addEventListener("click", () => {
    state.editingId = null;
    navigate("orders");
  });
}

function bindPricingRowButtons() {
  document.querySelectorAll("[data-remove-product]").forEach((button) => {
    button.onclick = () => {
      const rows = document.querySelectorAll("[data-pricing-row]");
      if (rows.length <= 1) {
        showToast("Keep at least one product.", "error");
        return;
      }
      button.closest("[data-pricing-row]").remove();
    };
  });
}

async function handlePricingSubmit(event) {
  event.preventDefault();
  const rows = [...document.querySelectorAll("[data-pricing-row]")];
  const tones = ["bg-amber-100 text-amber-800", "bg-stone-200 text-stone-800", "bg-lime-100 text-lime-800", "bg-orange-100 text-orange-900", "bg-rose-100 text-rose-800"];
  PRODUCTS = rows.map((row, index) => {
    const flavor = row.querySelector('[name="product-flavor"]').value.trim();
    const size = row.querySelector('[name="product-size"]').value.trim();
    const price = Number(row.querySelector('[name="product-price"]').value || 0);
    const existingId = row.querySelector('[name="product-id"]').value;
    return normalizeProduct({ id: existingId, flavor, size, price, tone: tones[index % tones.length] }, index);
  });
  appSettings.products = PRODUCTS;
  if (isCloudMode()) {
    try {
      await CLOUD.saveCatalog(PRODUCTS);
      await refreshCloudWorkspace();
    } catch (error) {
      showToast(error.message || "Could not save cloud pricing.", "error");
      return;
    }
  } else {
    saveSettings();
  }
  showToast("Pricing saved. New orders will use the latest prices.");
  render();
}
function renderOrderSearchResults() {
  const list = document.querySelector("#order-list");
  if (!list) return;
  const query = state.orderSearch.toLowerCase().trim();
  const filtered = state.orders
    .filter((order) => {
      if (state.orderFilter === "Active" && !isActive(order)) return false;
      if (state.orderFilter === "Completed" && isActive(order)) return false;
      return !query || [order.customerName, order.phone, order.id, order.batchId, order.customerNotes, order.remarks].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  list.innerHTML = filtered.length ? filtered.map(orderCard).join("") : emptyState("No matching orders", "Try another search or filter.");
  list.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", () => openOrder(button.dataset.orderId));
  });
  list.querySelectorAll("[data-advance-status]").forEach((button) => {
    button.addEventListener("click", () => advanceProductionStatus(button.dataset.advanceStatus));
  });
}

function updateFormTotal() {
  const form = document.querySelector("#order-form");
  let count = 0;
  let total = 0;
  PRODUCTS.forEach((product) => {
    const quantity = Number(form.elements[`qty-${product.id}`].value || 0);
    count += quantity;
    total += quantity * product.price;
  });
  const paid = Math.max(0, Math.min(total, Number(form.elements.amountPaid.value || 0)));
  document.querySelector("#form-item-count").textContent = `${count} ${count === 1 ? "item" : "items"}`;
  document.querySelector("#form-total").textContent = formatMoney(total);
  document.querySelector("#form-outstanding").textContent = `Outstanding: ${formatMoney(Math.max(0, total - paid))}`;
}

async function advanceProductionStatus(id) {
  const order = state.orders.find((entry) => entry.id === id);
  if (!order) return;
  const nextStatus = nextProductionStatus(order.productionStatus);
  if (!nextStatus) return;
  if (isCloudMode()) {
    try {
      await CLOUD.advanceStatus(order, nextStatus);
      await refreshCloudWorkspace();
      render();
      showToast(`${order.id} moved to ${nextStatus}.`);
    } catch (error) {
      showToast(error.message || "Could not update production status.", "error");
    }
    return;
  }
  order.productionStatus = nextStatus;
  order.updatedAt = new Date().toISOString();
  if (nextStatus === "Delivered" && !order.actualDeliveryDate) {
    order.actualDeliveryDate = dateOffset(0);
  }
  saveOrders();
  render();
  showToast(`${order.id} moved to ${nextStatus}.`);
}

function nextOrderId() {
  const highest = state.orders.reduce((max, order) => {
    const number = Number(order.id.replace(/\D/g, ""));
    return Math.max(max, number || 0);
  }, 1000);
  return `TAS-${highest + 1}`;
}

async function handleOrderSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const items = PRODUCTS.map((product) => ({
    productId: product.id,
    quantity: Number(data.get(`qty-${product.id}`) || 0),
    unitPrice: Number(product.price || 0),
  })).filter((item) => item.quantity > 0);

  if (!items.length) {
    showToast("Add at least one granola product.", "error");
    document.querySelector("[data-qty-input]")?.focus();
    return;
  }

  const existing = state.orders.find((order) => order.id === state.editingId);
  const amountPaidInput = Number(data.get("amountPaid") || 0);
  const order = {
    id: existing?.id || nextOrderId(),
    dbId: existing?.dbId || null,
    version: existing?.version || null,
    customerName: data.get("customerName").trim(),
    phone: data.get("phone").trim(),
    address: data.get("address").trim(),
    latestDeliveryDate: data.get("latestDeliveryDate"),
    paymentStatus: data.get("paymentStatus"),
    paymentMethod: data.get("paymentMethod"),
    amountPaid: Math.max(0, amountPaidInput),
    productionStatus: data.get("productionStatus"),
    deliveryMethod: data.get("deliveryMethod"),
    deliveryPerson: data.get("deliveryPerson").trim(),
    trackingNumber: data.get("trackingNumber").trim(),
    actualDeliveryDate: data.get("actualDeliveryDate"),
    batchId: data.get("batchId").trim(),
    customerNotes: data.get("customerNotes").trim(),
    remarks: data.get("remarks").trim(),
    items,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  order.amountPaid = Math.min(orderTotal(order), order.amountPaid);
  order.paymentStatus = paymentStatusForAmount(order, order.paymentStatus);

  if (isCloudMode()) {
    try {
      await CLOUD.saveOrder(order);
      await refreshCloudWorkspace();
    } catch (error) {
      showToast(error.message || "Could not save the shared order.", "error");
      return;
    }
  } else if (existing) {
    state.orders = state.orders.map((entry) => (entry.id === order.id ? order : entry));
  } else {
    state.orders.unshift(order);
  }
  saveOrders();
  state.editingId = null;
  state.page = "orders";
  render();
  showToast(existing ? "Order changes saved." : `${order.id} created successfully.`);
}

function populateEditForm() {
  const order = state.orders.find((entry) => entry.id === state.editingId);
  const form = document.querySelector("#order-form");
  if (!order || !form) return;
  [
    "customerName",
    "phone",
    "address",
    "latestDeliveryDate",
    "paymentStatus",
    "paymentMethod",
    "amountPaid",
    "productionStatus",
    "deliveryMethod",
    "deliveryPerson",
    "trackingNumber",
    "actualDeliveryDate",
    "batchId",
    "customerNotes",
    "remarks",
  ].forEach((field) => {
    form.elements[field].value = order[field] || "";
  });
  order.items.forEach((item) => {
    form.elements[`qty-${item.productId}`].value = item.quantity;
  });
  updateFormTotal();
}

function openOrder(id) {
  const order = state.orders.find((entry) => entry.id === id);
  if (!order) return;
  document.body.insertAdjacentHTML("beforeend", renderOrderModal(order));
  document.body.style.overflow = "hidden";

  const close = () => {
    document.querySelector("#order-modal")?.remove();
    document.body.style.overflow = "";
  };
  document.querySelector("[data-close-modal]").addEventListener("click", close);
  document.querySelector("#order-modal").addEventListener("click", (event) => {
    if (event.target.id === "order-modal") close();
  });
  document.querySelector("[data-modal-advance-status]")?.addEventListener("click", () => {
    close();
    advanceProductionStatus(id);
  });
  document.querySelector("[data-edit-order]")?.addEventListener("click", () => {
    close();
    state.editingId = id;
    state.page = "new-order";
    render();
  });
  document.querySelector("[data-delete-order]")?.addEventListener("click", async () => {
    if (!window.confirm(`${isCloudMode() ? "Archive" : "Delete"} ${order.id} for ${order.customerName}?`)) return;
    if (isCloudMode()) {
      try {
        await CLOUD.archiveOrder(order);
        await refreshCloudWorkspace();
      } catch (error) {
        showToast(error.message || "Could not archive the shared order.", "error");
        return;
      }
    } else {
      state.orders = state.orders.filter((entry) => entry.id !== id);
      saveOrders();
    }
    close();
    render();
    showToast(`${order.id} ${isCloudMode() ? "archived" : "deleted"}.`);
  });
}

async function refreshCloudWorkspace({ quiet = false } = {}) {
  if (!isCloudMode() || !state.cloudSession) return;
  if (!quiet) state.cloudLoading = true;
  try {
    const workspace = await CLOUD.loadWorkspace();
    state.orders = workspace.orders;
    PRODUCTS = workspace.products;
    state.cloudRoleCodes = workspace.access?.roles || [];
    appSettings = {
      ...appSettings,
      products: PRODUCTS,
    };
    state.cloudConnectedAt = new Date().toISOString();
    state.cloudError = "";
  } catch (error) {
    state.cloudError = error.message || "Could not load Supabase data.";
    if (!quiet) throw error;
  } finally {
    state.cloudLoading = false;
  }
}

async function refreshStaff() {
  if (!isCloudMode() || !canUse("manageStaff")) return;
  state.staffLoading = true;
  try {
    state.staff = await CLOUD.loadStaff();
    state.staffLoaded = true;
  } catch (error) {
    showToast(error.message || "Could not load staff.", "error");
  } finally {
    state.staffLoading = false;
  }
}

async function handleStaffInvite(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";
  try {
    await CLOUD.inviteStaff({
      full_name: String(data.get("fullName") || "").trim(),
      email: String(data.get("email") || "").trim(),
      role_code: String(data.get("role") || ""),
    });
    form.reset();
    form.elements.role.value = "sales_staff";
    await refreshStaff();
    render();
    showToast("Staff invitation sent.");
  } catch (error) {
    showToast(error.message || "Could not send invitation.", "error");
    submitButton.disabled = false;
    submitButton.textContent = "Send Invitation";
  }
}

async function changeStaffRole(userId, roleCode) {
  const member = state.staff.find((item) => item.user_id === userId);
  const role = STAFF_ROLES.find((item) => item.code === roleCode);
  if (!member || !role) return;
  try {
    await CLOUD.changeStaffRole(userId, roleCode);
    await refreshStaff();
    render();
    showToast(`${member.full_name} is now ${role.name}.`);
  } catch (error) {
    await refreshStaff();
    render();
    showToast(error.message || "Could not change role.", "error");
  }
}

async function toggleStaffStatus(userId, currentlyActive) {
  const member = state.staff.find((item) => item.user_id === userId);
  if (!member) return;
  const action = currentlyActive ? "disable" : "reactivate";
  if (!window.confirm(`${action === "disable" ? "Disable" : "Reactivate"} ${member.full_name}?`)) return;
  try {
    await CLOUD.setStaffActive(userId, !currentlyActive);
    await refreshStaff();
    render();
    showToast(`${member.full_name} ${currentlyActive ? "disabled" : "reactivated"}.`);
  } catch (error) {
    showToast(error.message || `Could not ${action} staff.`, "error");
  }
}

async function removeStaffMember(userId) {
  const member = state.staff.find((item) => item.user_id === userId);
  if (!member) return;
  if (!window.confirm(`Remove ${member.full_name} from Tastory? Their historical activity will be retained.`)) return;
  try {
    await CLOUD.removeStaff(userId);
    await refreshStaff();
    render();
    showToast(`${member.full_name} removed from Tastory.`);
  } catch (error) {
    showToast(error.message || "Could not remove staff.", "error");
  }
}

async function resendStaffInvitation(invitationId) {
  const invitation = state.staff.find((item) => item.invitation_id === invitationId);
  if (!invitation) return;
  try {
    await CLOUD.resendInvitation(invitationId);
    await refreshStaff();
    render();
    showToast(`Invitation resent to ${invitation.email}.`);
  } catch (error) {
    showToast(error.message || "Could not resend invitation.", "error");
  }
}

async function cancelStaffInvitation(invitationId) {
  const invitation = state.staff.find((item) => item.invitation_id === invitationId);
  if (!invitation) return;
  if (!window.confirm(`Cancel the invitation for ${invitation.email}?`)) return;
  try {
    await CLOUD.cancelInvitation(invitationId);
    await refreshStaff();
    render();
    showToast("Pending invitation cancelled.");
  } catch (error) {
    showToast(error.message || "Could not cancel invitation.", "error");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.cloudLoading = true;
  state.cloudError = "";
  render();
  try {
    state.cloudSession = await CLOUD.signIn(
      String(data.get("email") || "").trim(),
      String(data.get("password") || ""),
    );
    await CLOUD.touchSession();
    await refreshCloudWorkspace();
    CLOUD.subscribe(async () => {
      await refreshCloudWorkspace({ quiet: true });
      render();
    });
    state.page = "dashboard";
    render();
  } catch (error) {
    state.cloudSession = null;
    state.cloudError = error.message || "Sign-in failed.";
    state.cloudLoading = false;
    render();
  }
}

async function handlePasswordReset() {
  const email = document.querySelector("#login-form")?.elements.email.value.trim();
  if (!email) {
    showToast("Enter your email first.", "error");
    return;
  }
  try {
    await CLOUD.requestPasswordReset(email);
    showToast("Password reset email sent.");
  } catch (error) {
    showToast(error.message || "Could not send reset email.", "error");
  }
}

async function handlePasswordUpdate(event) {
  event.preventDefault();
  const password = new FormData(event.currentTarget).get("password");
  try {
    await CLOUD.updatePassword(password);
    history.replaceState({}, "", location.pathname);
    state.cloudSession = await CLOUD.session();
    await refreshCloudWorkspace();
    render();
    showToast("Password updated.");
  } catch (error) {
    state.cloudError = error.message || "Could not update password.";
    render();
  }
}

async function importLocalDataToCloud() {
  if (!window.confirm("Create a protected browser backup and import this device's local orders and pricing into Supabase?")) {
    return;
  }
  try {
    const result = await CLOUD.importLocalData();
    await refreshCloudWorkspace();
    render();
    showToast(`Imported ${result.importedOrders} orders and ${result.importedProducts} products.`);
  } catch (error) {
    showToast(error.message || "Local data import failed.", "error");
  }
}

async function initializeApp() {
  if (!isCloudMode()) {
    render();
    return;
  }
  state.cloudLoading = true;
  state.cloudError = "";
  try {
    state.cloudSession = await CLOUD.session();
    if (state.cloudSession) {
      await CLOUD.touchSession();
      await refreshCloudWorkspace();
      CLOUD.subscribe(async () => {
        await refreshCloudWorkspace({ quiet: true });
        render();
      });
    }
  } catch (error) {
    state.cloudError = error.message || "Could not initialize Supabase.";
  } finally {
    state.cloudLoading = false;
    render();
  }
}

function showToast(message, type = "success") {
  const region = document.querySelector("#toast-region");
  const toast = document.createElement("div");
  toast.className = `pointer-events-auto mx-auto max-w-md rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-soft ${
    type === "error" ? "bg-red-600" : "bg-forest"
  }`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

initializeApp();

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed.", error);
    });
  });
}
