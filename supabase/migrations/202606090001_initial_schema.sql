create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.customer_status as enum ('active', 'inactive', 'blacklisted', 'prospect');
create type public.payment_status as enum ('unpaid', 'deposit_paid', 'paid');
create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed', 'cancelled');
create type public.migration_status as enum ('pending', 'running', 'completed', 'failed', 'rolled_back');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'Asia/Kuala_Lumpur',
  currency_code char(3) not null default 'MYR',
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  active_business_id uuid references public.businesses(id),
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_.]*$'),
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_roles (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.users(id),
  assigned_at timestamptz not null default now(),
  primary key (business_id, user_id, role_id)
);

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  company_name text not null,
  whatsapp_number text,
  default_delivery_charge numeric(12,2) not null default 0 check (default_delivery_charge >= 0),
  tax_enabled boolean not null default false,
  tax_name text not null default 'SST',
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_registration_number text,
  prices_include_tax boolean not null default false,
  receipt_footer text,
  additional_settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  color text,
  is_active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  normalized_phone text,
  email text,
  default_address text,
  status public.customer_status not null default 'active',
  notes text,
  preferences jsonb not null default '{}'::jsonb,
  total_orders integer not null default 0 check (total_orders >= 0),
  total_spent numeric(14,2) not null default 0 check (total_spent >= 0),
  last_order_date date,
  customer_since date not null default current_date,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique nulls not distinct (business_id, normalized_phone)
);

create table public.customer_tag_assignments (
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag_id uuid not null references public.customer_tags(id) on delete cascade,
  assigned_by uuid references public.users(id),
  assigned_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sku text,
  size_label text not null,
  weight_grams numeric(10,2) check (weight_grams > 0),
  is_active boolean not null default true,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, product_id, size_label),
  unique nulls not distinct (business_id, sku)
);

create table public.pricing (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  currency_code char(3) not null default 'MYR',
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);

create unique index pricing_one_current_price
  on public.pricing (business_id, product_variant_id)
  where valid_to is null;

create table public.order_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  unique (business_id, name)
);

create table public.delivery_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  requires_tracking boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  unique (business_id, name)
);

create table public.production_statuses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null,
  display_order integer not null,
  is_terminal boolean not null default false,
  is_cancelled boolean not null default false,
  is_active boolean not null default true,
  unique (business_id, code),
  unique (business_id, display_order)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_number text not null,
  legacy_order_id text,
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_source_id uuid references public.order_sources(id),
  order_source_other text,
  delivery_method_id uuid references public.delivery_methods(id),
  delivery_method_other text,
  delivery_address text,
  delivery_person text,
  tracking_number text,
  latest_delivery_date date,
  actual_delivery_at timestamptz,
  payment_status public.payment_status not null default 'unpaid',
  payment_method text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  production_status_id uuid not null references public.production_statuses(id),
  batch_id text,
  customer_notes_snapshot text,
  remarks text,
  assigned_sales_user_id uuid references public.users(id),
  assigned_production_user_id uuid references public.users(id),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (business_id, order_number),
  unique nulls not distinct (business_id, legacy_order_id),
  check (amount_paid <= total_amount),
  check (discount_amount <= subtotal + delivery_fee),
  check (
    (order_source_other is null)
    or length(trim(order_source_other)) > 0
  ),
  check (
    (delivery_method_other is null)
    or length(trim(delivery_method_other)) > 0
  )
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_variant_id uuid references public.product_variants(id) on delete restrict,
  product_name_snapshot text not null,
  variant_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status_id uuid references public.production_statuses(id),
  to_status_id uuid not null references public.production_statuses(id),
  comment text,
  changed_by uuid not null references public.users(id),
  changed_at timestamptz not null default now()
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  location text not null default 'Main',
  quantity_on_hand numeric(14,3) not null default 0,
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  updated_at timestamptz not null default now(),
  unique (business_id, product_variant_id, location)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  movement_type text not null,
  quantity numeric(14,3) not null check (quantity <> 0),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete cascade,
  actor_user_id uuid references public.users(id),
  action text not null,
  table_name text not null,
  record_id text,
  occurred_at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb,
  request_id uuid default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  payload jsonb not null,
  status public.notification_status not null default 'pending',
  idempotency_key text not null unique,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  source_name text not null,
  source_version text,
  source_origin text,
  file_name text,
  file_sha256 text not null unique,
  status public.migration_status not null default 'pending',
  expected_counts jsonb not null default '{}'::jsonb,
  imported_counts jsonb not null default '{}'::jsonb,
  validation_results jsonb not null default '{}'::jsonb,
  started_by uuid references public.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.migration_records (
  id bigint generated always as identity primary key,
  migration_run_id uuid not null references public.migration_runs(id) on delete cascade,
  entity_type text not null,
  source_id text not null,
  target_id uuid,
  source_checksum text,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  unique (migration_run_id, entity_type, source_id)
);

create index customers_business_name_idx on public.customers (business_id, name);
create index customers_phone_trgm_idx on public.customers using gin (normalized_phone gin_trgm_ops);
create index orders_business_created_idx on public.orders (business_id, created_at desc);
create index orders_business_status_idx on public.orders (business_id, production_status_id);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_sales_assignee_idx on public.orders (assigned_sales_user_id, created_at desc);
create index orders_production_assignee_idx on public.orders (assigned_production_user_id, created_at desc);
create index activity_logs_business_time_idx on public.activity_logs (business_id, occurred_at desc);
create index notification_outbox_pending_idx
  on public.notification_outbox (next_attempt_at)
  where status in ('pending', 'failed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_set_updated_at before update on public.businesses
for each row execute function public.set_updated_at();
create trigger users_set_updated_at before update on public.users
for each row execute function public.set_updated_at();
create trigger business_settings_set_updated_at before update on public.business_settings
for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();
create trigger inventory_set_updated_at before update on public.inventory
for each row execute function public.set_updated_at();
