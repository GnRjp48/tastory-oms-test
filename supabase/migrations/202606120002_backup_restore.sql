create or replace function public.create_oms_backup_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
  business_row jsonb;
  snapshot jsonb;
begin
  if not public.has_permission('settings.manage', active_business) then
    raise exception 'Admin access is required';
  end if;

  select to_jsonb(b) into business_row
  from public.businesses b
  where b.id = active_business;

  snapshot := jsonb_build_object(
    'format', 'tastory-oms-supabase-backup',
    'formatVersion', 1,
    'backupId', gen_random_uuid(),
    'createdAt', now(),
    'omsVersion', '5.0.0',
    'schemaVersion', '202606120002',
    'business', business_row,
    'metadata', jsonb_build_object(
      'totalSales', coalesce((select sum(o.total_amount) from public.orders o where o.business_id = active_business and o.archived_at is null), 0),
      'source', 'shared_workspace'
    ),
    'data', jsonb_build_object(
      'customers', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.customers t where t.business_id = active_business), '[]'::jsonb),
      'customerTags', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.customer_tags t where t.business_id = active_business), '[]'::jsonb),
      'customerTagAssignments', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.assigned_at)
        from public.customer_tag_assignments t
        join public.customers c on c.id = t.customer_id
        where c.business_id = active_business
      ), '[]'::jsonb),
      'products', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.products t where t.business_id = active_business), '[]'::jsonb),
      'productVariants', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.product_variants t where t.business_id = active_business), '[]'::jsonb),
      'pricing', coalesce((select jsonb_agg(to_jsonb(t) order by t.valid_from) from public.pricing t where t.business_id = active_business), '[]'::jsonb),
      'orderSources', coalesce((select jsonb_agg(to_jsonb(t) order by t.display_order) from public.order_sources t where t.business_id = active_business), '[]'::jsonb),
      'deliveryMethods', coalesce((select jsonb_agg(to_jsonb(t) order by t.display_order) from public.delivery_methods t where t.business_id = active_business), '[]'::jsonb),
      'productionStatuses', coalesce((select jsonb_agg(to_jsonb(t) order by t.display_order) from public.production_statuses t where t.business_id = active_business), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.orders t where t.business_id = active_business), '[]'::jsonb),
      'orderItems', coalesce((select jsonb_agg(to_jsonb(t) - 'line_total' order by t.created_at) from public.order_items t where t.business_id = active_business), '[]'::jsonb),
      'productionHistory', coalesce((select jsonb_agg(to_jsonb(t) order by t.changed_at) from public.order_status_history t where t.business_id = active_business), '[]'::jsonb),
      'businessSettings', coalesce((select jsonb_agg(to_jsonb(t)) from public.business_settings t where t.business_id = active_business), '[]'::jsonb),
      'staffAssignments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', ur.user_id,
          'email', u.email,
          'full_name', u.full_name,
          'is_active', u.is_active,
          'role_code', r.code,
          'assigned_at', ur.assigned_at
        ) order by u.email)
        from public.user_roles ur
        join public.users u on u.id = ur.user_id
        join public.roles r on r.id = ur.role_id
        where ur.business_id = active_business
      ), '[]'::jsonb)
    )
  );

  return snapshot;
end;
$$;

create or replace function public.preview_oms_restore(requested_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
begin
  if not public.has_permission('settings.manage', active_business) then
    raise exception 'Admin access is required';
  end if;
  if requested_backup ->> 'format' <> 'tastory-oms-supabase-backup'
     or (requested_backup #>> '{business,id}')::uuid <> active_business then
    raise exception 'This is not a valid backup for the active business';
  end if;

  return jsonb_build_object(
    'duplicates', jsonb_build_object(
      'customers', (
        select count(*) from public.customers c
        where c.business_id = active_business
          and exists (
            select 1 from jsonb_array_elements(coalesce(requested_backup #> '{data,customers}', '[]'::jsonb)) b
            where b ->> 'id' = c.id::text
          )
      ),
      'orders', (
        select count(*) from public.orders o
        where o.business_id = active_business
          and exists (
            select 1 from jsonb_array_elements(coalesce(requested_backup #> '{data,orders}', '[]'::jsonb)) b
            where b ->> 'id' = o.id::text
          )
      ),
      'orderItems', (
        select count(*) from public.order_items oi
        where oi.business_id = active_business
          and exists (
            select 1 from jsonb_array_elements(coalesce(requested_backup #> '{data,orderItems}', '[]'::jsonb)) b
            where b ->> 'id' = oi.id::text
          )
      ),
      'pricing', (
        select count(*) from public.pricing p
        where p.business_id = active_business
          and exists (
            select 1 from jsonb_array_elements(coalesce(requested_backup #> '{data,pricing}', '[]'::jsonb)) b
            where b ->> 'id' = p.id::text
          )
      )
    )
  );
end;
$$;

create or replace function public.restore_oms_backup(
  requested_backup jsonb,
  conflict_strategy text default 'skip'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
  actor uuid := auth.uid();
  row_data jsonb;
  restored_customers integer := 0;
  restored_orders integer := 0;
  restored_items integer := 0;
  restored_pricing integer := 0;
  restored_staff integer := 0;
begin
  if not public.has_permission('settings.manage', active_business) then
    raise exception 'Admin access is required';
  end if;
  if requested_backup ->> 'format' <> 'tastory-oms-supabase-backup'
     or (requested_backup ->> 'formatVersion')::integer <> 1 then
    raise exception 'Unsupported Tastory backup format';
  end if;
  if (requested_backup #>> '{business,id}')::uuid <> active_business then
    raise exception 'This backup belongs to a different business';
  end if;
  if conflict_strategy not in ('skip', 'overwrite') then
    raise exception 'Conflict strategy must be skip or overwrite';
  end if;

  create temporary table restore_new_orders (id uuid primary key) on commit drop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,customerTags}', '[]'::jsonb))
  loop
    insert into public.customer_tags (id, business_id, name, color, is_active, created_by, created_at)
    values (
      (row_data ->> 'id')::uuid, active_business, row_data ->> 'name', row_data ->> 'color',
      coalesce((row_data ->> 'is_active')::boolean, true), actor,
      coalesce((row_data ->> 'created_at')::timestamptz, now())
    )
    on conflict do nothing;
  end loop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,customers}', '[]'::jsonb))
  loop
    insert into public.customers (
      id, business_id, name, phone, normalized_phone, email, default_address, status, notes,
      preferences, total_orders, total_spent, last_order_date, customer_since, created_by,
      updated_by, created_at, updated_at, archived_at
    )
    values (
      (row_data ->> 'id')::uuid, active_business, row_data ->> 'name', row_data ->> 'phone',
      row_data ->> 'normalized_phone', row_data ->> 'email', row_data ->> 'default_address',
      coalesce((row_data ->> 'status')::public.customer_status, 'active'), row_data ->> 'notes',
      coalesce(row_data -> 'preferences', '{}'::jsonb), coalesce((row_data ->> 'total_orders')::integer, 0),
      coalesce((row_data ->> 'total_spent')::numeric, 0), (row_data ->> 'last_order_date')::date,
      coalesce((row_data ->> 'customer_since')::date, current_date), actor, actor,
      coalesce((row_data ->> 'created_at')::timestamptz, now()),
      coalesce((row_data ->> 'updated_at')::timestamptz, now()), (row_data ->> 'archived_at')::timestamptz
    )
    on conflict do nothing;
    if conflict_strategy = 'overwrite' then
      update public.customers
      set name = row_data ->> 'name',
          phone = row_data ->> 'phone',
          email = row_data ->> 'email',
          default_address = row_data ->> 'default_address',
          status = coalesce((row_data ->> 'status')::public.customer_status, status),
          notes = row_data ->> 'notes',
          preferences = coalesce(row_data -> 'preferences', preferences),
          updated_by = actor,
          updated_at = now()
      where id = (row_data ->> 'id')::uuid
        and business_id = active_business;
    end if;
    restored_customers := restored_customers + 1;
  end loop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,products}', '[]'::jsonb))
  loop
    insert into public.products (id, business_id, name, description, is_active, created_by, updated_by, created_at, updated_at)
    values (
      (row_data ->> 'id')::uuid, active_business, row_data ->> 'name', row_data ->> 'description',
      coalesce((row_data ->> 'is_active')::boolean, true), actor, actor,
      coalesce((row_data ->> 'created_at')::timestamptz, now()), coalesce((row_data ->> 'updated_at')::timestamptz, now())
    )
    on conflict do nothing;
  end loop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,productVariants}', '[]'::jsonb))
  loop
    insert into public.product_variants (
      id, business_id, product_id, sku, size_label, weight_grams, is_active, created_by, updated_by, created_at, updated_at
    )
    values (
      (row_data ->> 'id')::uuid, active_business, (row_data ->> 'product_id')::uuid, row_data ->> 'sku',
      row_data ->> 'size_label', (row_data ->> 'weight_grams')::numeric,
      coalesce((row_data ->> 'is_active')::boolean, true), actor, actor,
      coalesce((row_data ->> 'created_at')::timestamptz, now()), coalesce((row_data ->> 'updated_at')::timestamptz, now())
    )
    on conflict do nothing;
  end loop;

  if conflict_strategy = 'overwrite' then
    delete from public.pricing where business_id = active_business;
  end if;
  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,pricing}', '[]'::jsonb))
  loop
    insert into public.pricing (id, business_id, product_variant_id, amount, currency_code, valid_from, valid_to, created_by, created_at)
    values (
      (row_data ->> 'id')::uuid, active_business, (row_data ->> 'product_variant_id')::uuid,
      (row_data ->> 'amount')::numeric, coalesce(row_data ->> 'currency_code', 'MYR'),
      coalesce((row_data ->> 'valid_from')::timestamptz, now()), (row_data ->> 'valid_to')::timestamptz,
      actor, coalesce((row_data ->> 'created_at')::timestamptz, now())
    )
    on conflict do nothing;
    restored_pricing := restored_pricing + 1;
  end loop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,orders}', '[]'::jsonb))
  loop
    insert into public.orders (
      id, business_id, order_number, legacy_order_id, customer_id, order_source_id, order_source_other,
      delivery_method_id, delivery_method_other, delivery_address, delivery_person, tracking_number,
      latest_delivery_date, actual_delivery_at, payment_status, payment_method, subtotal, delivery_fee,
      discount_amount, tax_amount, total_amount, amount_paid, production_status_id, batch_id,
      customer_notes_snapshot, remarks, assigned_sales_user_id, assigned_production_user_id, version,
      created_by, updated_by, created_at, updated_at, archived_at
    )
    values (
      (row_data ->> 'id')::uuid, active_business, row_data ->> 'order_number', row_data ->> 'legacy_order_id',
      (row_data ->> 'customer_id')::uuid, (row_data ->> 'order_source_id')::uuid, row_data ->> 'order_source_other',
      (row_data ->> 'delivery_method_id')::uuid, row_data ->> 'delivery_method_other', row_data ->> 'delivery_address',
      row_data ->> 'delivery_person', row_data ->> 'tracking_number', (row_data ->> 'latest_delivery_date')::date,
      (row_data ->> 'actual_delivery_at')::timestamptz, 'unpaid', row_data ->> 'payment_method',
      coalesce((row_data ->> 'subtotal')::numeric, 0), coalesce((row_data ->> 'delivery_fee')::numeric, 0),
      coalesce((row_data ->> 'discount_amount')::numeric, 0), coalesce((row_data ->> 'tax_amount')::numeric, 0),
      coalesce((row_data ->> 'total_amount')::numeric, 0), 0, (row_data ->> 'production_status_id')::uuid,
      row_data ->> 'batch_id', row_data ->> 'customer_notes_snapshot', row_data ->> 'remarks',
      case when exists (select 1 from public.users where id = (row_data ->> 'assigned_sales_user_id')::uuid) then (row_data ->> 'assigned_sales_user_id')::uuid end,
      case when exists (select 1 from public.users where id = (row_data ->> 'assigned_production_user_id')::uuid) then (row_data ->> 'assigned_production_user_id')::uuid end,
      coalesce((row_data ->> 'version')::integer, 1), actor, actor,
      coalesce((row_data ->> 'created_at')::timestamptz, now()), coalesce((row_data ->> 'updated_at')::timestamptz, now()),
      (row_data ->> 'archived_at')::timestamptz
    )
    on conflict do nothing;
    if found then
      insert into restore_new_orders (id) values ((row_data ->> 'id')::uuid) on conflict do nothing;
    end if;
    if conflict_strategy = 'overwrite' then
      update public.orders
      set delivery_address = row_data ->> 'delivery_address',
          production_status_id = (row_data ->> 'production_status_id')::uuid,
          remarks = row_data ->> 'remarks',
          customer_notes_snapshot = row_data ->> 'customer_notes_snapshot',
          updated_by = actor
      where id = (row_data ->> 'id')::uuid
        and business_id = active_business;
    end if;
    restored_orders := restored_orders + 1;
  end loop;

  if conflict_strategy = 'overwrite' then
    update public.orders o
    set amount_paid = 0
    where o.business_id = active_business
      and exists (
        select 1 from jsonb_array_elements(coalesce(requested_backup #> '{data,orders}', '[]'::jsonb)) b
        where (b ->> 'id')::uuid = o.id
      );

    delete from public.order_items oi
    where oi.business_id = active_business
      and exists (
        select 1 from jsonb_array_elements(coalesce(requested_backup #> '{data,orders}', '[]'::jsonb)) b
        where (b ->> 'id')::uuid = oi.order_id
      );
  end if;
  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,orderItems}', '[]'::jsonb))
  loop
    insert into public.order_items (
      id, business_id, order_id, product_variant_id, product_name_snapshot, variant_name_snapshot,
      quantity, unit_price, created_at
    )
    values (
      (row_data ->> 'id')::uuid, active_business, (row_data ->> 'order_id')::uuid,
      (row_data ->> 'product_variant_id')::uuid, row_data ->> 'product_name_snapshot',
      row_data ->> 'variant_name_snapshot', (row_data ->> 'quantity')::integer,
      (row_data ->> 'unit_price')::numeric, coalesce((row_data ->> 'created_at')::timestamptz, now())
    )
    on conflict (id) do nothing;
    restored_items := restored_items + 1;
  end loop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,orders}', '[]'::jsonb))
  loop
    update public.orders
    set amount_paid = least(coalesce((row_data ->> 'amount_paid')::numeric, 0), total_amount),
        payment_status = coalesce((row_data ->> 'payment_status')::public.payment_status, 'unpaid'),
        updated_at = coalesce((row_data ->> 'updated_at')::timestamptz, updated_at)
    where id = (row_data ->> 'id')::uuid
      and business_id = active_business
      and (
        conflict_strategy = 'overwrite'
        or exists (select 1 from restore_new_orders n where n.id = public.orders.id)
      );
  end loop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,customerTagAssignments}', '[]'::jsonb))
  loop
    insert into public.customer_tag_assignments (customer_id, tag_id, assigned_by, assigned_at)
    values (
      (row_data ->> 'customer_id')::uuid, (row_data ->> 'tag_id')::uuid, actor,
      coalesce((row_data ->> 'assigned_at')::timestamptz, now())
    )
    on conflict do nothing;
  end loop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,productionHistory}', '[]'::jsonb))
  loop
    insert into public.order_status_history (
      id, business_id, order_id, from_status_id, to_status_id, comment, changed_by, changed_at
    )
    values (
      (row_data ->> 'id')::uuid, active_business, (row_data ->> 'order_id')::uuid,
      (row_data ->> 'from_status_id')::uuid, (row_data ->> 'to_status_id')::uuid,
      row_data ->> 'comment', actor, coalesce((row_data ->> 'changed_at')::timestamptz, now())
    )
    on conflict (id) do nothing;
  end loop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,businessSettings}', '[]'::jsonb))
  loop
    update public.business_settings
    set company_name = coalesce(row_data ->> 'company_name', company_name),
        whatsapp_number = row_data ->> 'whatsapp_number',
        default_delivery_charge = coalesce((row_data ->> 'default_delivery_charge')::numeric, default_delivery_charge),
        tax_enabled = coalesce((row_data ->> 'tax_enabled')::boolean, tax_enabled),
        tax_name = coalesce(row_data ->> 'tax_name', tax_name),
        tax_rate = coalesce((row_data ->> 'tax_rate')::numeric, tax_rate),
        tax_registration_number = row_data ->> 'tax_registration_number',
        prices_include_tax = coalesce((row_data ->> 'prices_include_tax')::boolean, prices_include_tax),
        receipt_footer = row_data ->> 'receipt_footer',
        additional_settings = coalesce(row_data -> 'additional_settings', additional_settings),
        updated_by = actor,
        updated_at = now()
    where business_id = active_business
      and conflict_strategy = 'overwrite';
  end loop;

  for row_data in select value from jsonb_array_elements(coalesce(requested_backup #> '{data,staffAssignments}', '[]'::jsonb))
  loop
    insert into public.user_roles (business_id, user_id, role_id, assigned_by, assigned_at)
    select active_business, u.id, r.id, actor, coalesce((row_data ->> 'assigned_at')::timestamptz, now())
    from public.users u
    join public.roles r on r.code = row_data ->> 'role_code'
    where u.id = (row_data ->> 'user_id')::uuid
    on conflict do nothing;
    if found then restored_staff := restored_staff + 1; end if;
  end loop;

  insert into public.activity_logs (
    business_id, actor_user_id, action, table_name, record_id, metadata
  )
  values (
    active_business, actor, 'backup_restored', 'businesses', active_business::text,
    jsonb_build_object(
      'backup_id', requested_backup ->> 'backupId',
      'backup_created_at', requested_backup ->> 'createdAt',
      'conflict_strategy', conflict_strategy,
      'customers', restored_customers,
      'orders', restored_orders,
      'order_items', restored_items,
      'pricing', restored_pricing,
      'staff_assignments', restored_staff
    )
  );

  return jsonb_build_object(
    'customers', restored_customers,
    'orders', restored_orders,
    'orderItems', restored_items,
    'pricing', restored_pricing,
    'staffAssignments', restored_staff
  );
end;
$$;

create or replace function public.log_oms_client_event(
  requested_action text,
  requested_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
begin
  if not public.has_permission('settings.manage', active_business) then
    raise exception 'Admin access is required';
  end if;

  if requested_action not in (
    'emergency_mode_enabled',
    'emergency_mode_disabled',
    'local_data_imported',
    'local_data_exported',
    'backup_created',
    'backup_downloaded',
    'backup_restored',
    'scheduled_backup_completed',
    'scheduled_backup_failed'
  ) then
    raise exception 'Unsupported client event';
  end if;

  insert into public.activity_logs (
    business_id, actor_user_id, action, table_name, record_id, metadata
  )
  values (
    active_business, auth.uid(), requested_action, 'oms_backup', auth.uid()::text,
    coalesce(requested_metadata, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.create_oms_backup_snapshot() from anon, public;
revoke execute on function public.preview_oms_restore(jsonb) from anon, public;
revoke execute on function public.restore_oms_backup(jsonb, text) from anon, public;
revoke execute on function public.log_oms_client_event(text, jsonb) from anon, public;
grant execute on function public.create_oms_backup_snapshot() to authenticated;
grant execute on function public.preview_oms_restore(jsonb) to authenticated;
grant execute on function public.restore_oms_backup(jsonb, text) to authenticated;
grant execute on function public.log_oms_client_event(text, jsonb) to authenticated;
