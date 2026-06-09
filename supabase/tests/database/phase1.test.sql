begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

select has_table('public', 'customers', 'customers table exists');
select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'activity_logs', 'activity log table exists');
select has_table('public', 'notification_outbox', 'notification outbox exists');
select has_table('public', 'migration_staging', 'migration staging exists');

select has_column('public', 'customers', 'total_orders', 'customer total_orders exists');
select has_column('public', 'customers', 'total_spent', 'customer total_spent exists');
select has_column('public', 'customers', 'last_order_date', 'customer last_order_date exists');
select has_column('public', 'customers', 'customer_since', 'customer customer_since exists');
select has_column('public', 'customers', 'status', 'customer status exists');

select has_column('public', 'business_settings', 'company_name', 'company name setting exists');
select has_column('public', 'business_settings', 'whatsapp_number', 'WhatsApp setting exists');
select has_column(
  'public',
  'business_settings',
  'default_delivery_charge',
  'delivery charge setting exists'
);
select has_column('public', 'business_settings', 'tax_enabled', 'tax setting exists');
select has_column('public', 'business_settings', 'receipt_footer', 'receipt footer exists');

select results_eq(
  $$ select unnest(enum_range(null::public.customer_status))::text $$,
  $$ values ('active'::text), ('inactive'::text), ('blacklisted'::text), ('prospect'::text) $$,
  'customer lifecycle statuses are available'
);

select results_eq(
  $$ select code from public.roles order by code $$,
  $$ values ('admin'::text), ('manager'::text), ('production_staff'::text), ('sales_staff'::text) $$,
  'required roles are seeded'
);

select ok(
  exists (
    select 1
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.code = 'admin' and p.code = 'users.manage'
  ),
  'admin can manage users'
);

select ok(
  exists (
    select 1
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.code = 'manager' and p.code = 'customers.status_manage'
  ),
  'manager can manage customer status'
);

select ok(
  exists (
    select 1
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.code = 'sales_staff' and p.code = 'orders.create'
  ),
  'sales staff can create orders'
);

select ok(
  not exists (
    select 1
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.code = 'sales_staff'
      and p.code in ('pricing.manage', 'settings.manage', 'users.manage', 'customers.status_manage')
  ),
  'sales staff cannot manage protected configuration'
);

select ok(
  exists (
    select 1
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.code = 'production_staff' and p.code = 'production.update'
  ),
  'production staff can update production'
);

select ok(
  not exists (
    select 1
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.code = 'production_staff'
      and p.code in ('orders.create', 'pricing.manage', 'settings.manage', 'users.manage')
  ),
  'production staff cannot access protected management capabilities'
);

select has_function('public', 'custom_access_token_hook', array['jsonb'], 'JWT hook exists');
select has_function('public', 'create_business_with_defaults', array['text'], 'business bootstrap exists');
select has_function(
  'public',
  'advance_production_status',
  array['uuid', 'uuid', 'integer', 'text'],
  'production workflow RPC exists'
);
select has_function(
  'public',
  'set_customer_status',
  array['uuid', 'customer_status'],
  'customer status RPC exists'
);
select has_function(
  'public',
  'begin_local_storage_migration',
  array['text', 'text', 'text', 'text', 'jsonb'],
  'migration start RPC exists'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.customers'::regclass),
  true,
  'customers RLS is enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass),
  true,
  'orders RLS is enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.activity_logs'::regclass),
  true,
  'activity log RLS is enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass),
  true,
  'notification outbox RLS is enabled'
);

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ),
  'orders are published to realtime'
);
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_status_history'
  ),
  'order status history is published to realtime'
);

select * from finish();
rollback;
