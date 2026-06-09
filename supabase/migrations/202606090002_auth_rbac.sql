insert into public.roles (code, name, description) values
  ('admin', 'Admin', 'Full access to the business and all administrative functions.'),
  ('manager', 'Manager', 'Operational management, customer, order, production, and reporting access.'),
  ('sales_staff', 'Sales Staff', 'Creates orders and manages customer details without administrative access.'),
  ('production_staff', 'Production Staff', 'Views assigned production work and updates production status.')
on conflict (code) do update
set name = excluded.name, description = excluded.description;

insert into public.permissions (code, description) values
  ('business.read', 'View business information'),
  ('settings.manage', 'Manage business settings'),
  ('users.manage', 'Invite, disable, and manage users'),
  ('roles.manage', 'Assign roles and permissions'),
  ('customers.read', 'View customers'),
  ('customers.create', 'Create customers'),
  ('customers.update', 'Update customer details'),
  ('customers.status_manage', 'Change customer lifecycle status'),
  ('customers.archive', 'Archive customers'),
  ('customer_tags.assign', 'Assign existing customer tags'),
  ('customer_tags.manage', 'Create and manage customer tags'),
  ('orders.read_all', 'View all orders in the business'),
  ('orders.read_own', 'View own or sales-assigned orders'),
  ('orders.read_assigned', 'View production-assigned orders'),
  ('orders.create', 'Create orders'),
  ('orders.update_all', 'Update all orders'),
  ('orders.update_own', 'Update own or sales-assigned orders before production lock'),
  ('orders.archive', 'Archive orders'),
  ('orders.delete', 'Permanently delete orders'),
  ('production.read', 'View production workflow'),
  ('production.update', 'Update assigned production workflow'),
  ('products.read', 'View products and variants'),
  ('products.manage', 'Manage products and variants'),
  ('pricing.read', 'View pricing'),
  ('pricing.manage', 'Manage pricing'),
  ('reports.sales', 'View sales reports'),
  ('reports.production', 'View production reports'),
  ('inventory.read', 'View inventory'),
  ('inventory.manage', 'Manage inventory'),
  ('activity.read', 'View activity logs'),
  ('migrations.manage', 'Run and validate data migrations')
on conflict (code) do update
set description = excluded.description;

with grants(role_code, permission_code) as (
  values
    ('admin', 'business.read'),
    ('admin', 'settings.manage'),
    ('admin', 'users.manage'),
    ('admin', 'roles.manage'),
    ('admin', 'customers.read'),
    ('admin', 'customers.create'),
    ('admin', 'customers.update'),
    ('admin', 'customers.status_manage'),
    ('admin', 'customers.archive'),
    ('admin', 'customer_tags.assign'),
    ('admin', 'customer_tags.manage'),
    ('admin', 'orders.read_all'),
    ('admin', 'orders.create'),
    ('admin', 'orders.update_all'),
    ('admin', 'orders.archive'),
    ('admin', 'orders.delete'),
    ('admin', 'production.read'),
    ('admin', 'production.update'),
    ('admin', 'products.read'),
    ('admin', 'products.manage'),
    ('admin', 'pricing.read'),
    ('admin', 'pricing.manage'),
    ('admin', 'reports.sales'),
    ('admin', 'reports.production'),
    ('admin', 'inventory.read'),
    ('admin', 'inventory.manage'),
    ('admin', 'activity.read'),
    ('admin', 'migrations.manage'),

    ('manager', 'business.read'),
    ('manager', 'customers.read'),
    ('manager', 'customers.create'),
    ('manager', 'customers.update'),
    ('manager', 'customers.status_manage'),
    ('manager', 'customers.archive'),
    ('manager', 'customer_tags.assign'),
    ('manager', 'customer_tags.manage'),
    ('manager', 'orders.read_all'),
    ('manager', 'orders.create'),
    ('manager', 'orders.update_all'),
    ('manager', 'orders.archive'),
    ('manager', 'production.read'),
    ('manager', 'production.update'),
    ('manager', 'products.read'),
    ('manager', 'pricing.read'),
    ('manager', 'reports.sales'),
    ('manager', 'reports.production'),
    ('manager', 'inventory.read'),
    ('manager', 'inventory.manage'),

    ('sales_staff', 'business.read'),
    ('sales_staff', 'customers.read'),
    ('sales_staff', 'customers.create'),
    ('sales_staff', 'customers.update'),
    ('sales_staff', 'customer_tags.assign'),
    ('sales_staff', 'orders.read_own'),
    ('sales_staff', 'orders.create'),
    ('sales_staff', 'production.read'),
    ('sales_staff', 'products.read'),
    ('sales_staff', 'pricing.read'),

    ('production_staff', 'business.read'),
    ('production_staff', 'orders.read_assigned'),
    ('production_staff', 'production.read'),
    ('production_staff', 'production.update'),
    ('production_staff', 'products.read'),
    ('production_staff', 'inventory.read')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.code = g.role_code
join public.permissions p on p.code = g.permission_code
on conflict do nothing;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.users.full_name, excluded.full_name),
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.users (id, email, full_name, created_at)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'full_name', split_part(coalesce(email, ''), '@', 1)),
  created_at
from auth.users
on conflict (id) do nothing;

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select active_business_id
  from public.users
  where id = auth.uid()
    and is_active = true;
$$;

create or replace function public.is_business_member(requested_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    where ur.business_id = requested_business_id
      and ur.user_id = auth.uid()
      and u.is_active = true
  );
$$;

create or replace function public.has_permission(
  requested_permission text,
  requested_business_id uuid default public.current_business_id()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    join public.users u on u.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.business_id = requested_business_id
      and p.code = requested_permission
      and u.is_active = true
  );
$$;

create or replace function public.has_role(
  requested_role text,
  requested_business_id uuid default public.current_business_id()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.users u on u.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.business_id = requested_business_id
      and r.code = requested_role
      and u.is_active = true
  );
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  selected_business_id uuid;
  role_codes jsonb;
begin
  select u.active_business_id
  into selected_business_id
  from public.users u
  where u.id = (event ->> 'user_id')::uuid
    and u.is_active = true;

  select coalesce(jsonb_agg(r.code order by r.code), '[]'::jsonb)
  into role_codes
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (event ->> 'user_id')::uuid
    and ur.business_id = selected_business_id;

  claims := event -> 'claims';
  claims := jsonb_set(
    claims,
    '{active_business_id}',
    coalesce(to_jsonb(selected_business_id), 'null'::jsonb),
    true
  );
  claims := jsonb_set(claims, '{app_roles}', role_codes, true);
  event := jsonb_set(event, '{claims}', claims, true);
  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

revoke execute on function public.handle_new_auth_user() from authenticated, anon, public;
revoke execute on function public.current_business_id() from anon, public;
revoke execute on function public.is_business_member(uuid) from anon, public;
revoke execute on function public.has_permission(text, uuid) from anon, public;
revoke execute on function public.has_role(text, uuid) from anon, public;
grant execute on function public.current_business_id() to authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_permission(text, uuid) to authenticated;
grant execute on function public.has_role(text, uuid) to authenticated;

create or replace function public.create_business_with_defaults(company_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_business_id uuid;
  admin_role_id uuid;
  base_slug text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(company_name), '') is null then
    raise exception 'Company name is required';
  end if;

  if exists (
    select 1 from public.user_roles where user_id = auth.uid()
  ) then
    raise exception 'User already belongs to a business';
  end if;

  base_slug := lower(regexp_replace(trim(company_name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);

  insert into public.businesses (name, slug, created_by)
  values (
    trim(company_name),
    base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    auth.uid()
  )
  returning id into new_business_id;

  update public.users
  set active_business_id = new_business_id
  where id = auth.uid();

  select id into admin_role_id from public.roles where code = 'admin';

  insert into public.user_roles (business_id, user_id, role_id, assigned_by)
  values (new_business_id, auth.uid(), admin_role_id, auth.uid());

  insert into public.business_settings (
    business_id,
    company_name,
    whatsapp_number,
    default_delivery_charge,
    tax_enabled,
    tax_name,
    tax_rate,
    receipt_footer,
    updated_by
  )
  values (
    new_business_id,
    trim(company_name),
    null,
    0,
    false,
    'SST',
    0,
    'Thank you for supporting Tastory.',
    auth.uid()
  );

  insert into public.customer_tags (business_id, name, color, created_by) values
    (new_business_id, 'Retail', '#DCE8DA', auth.uid()),
    (new_business_id, 'VIP', '#FDE68A', auth.uid()),
    (new_business_id, 'Gym', '#BFDBFE', auth.uid()),
    (new_business_id, 'Wholesale', '#E9D5FF', auth.uid()),
    (new_business_id, 'Corporate', '#FED7AA', auth.uid());

  insert into public.order_sources (business_id, name, display_order) values
    (new_business_id, 'WhatsApp', 10),
    (new_business_id, 'Facebook', 20),
    (new_business_id, 'Instagram', 30),
    (new_business_id, 'Website', 40),
    (new_business_id, 'Shopee', 50),
    (new_business_id, 'Walk-in', 60),
    (new_business_id, 'Other', 70);

  insert into public.delivery_methods (business_id, name, requires_tracking, display_order) values
    (new_business_id, 'Self Pickup', false, 10),
    (new_business_id, 'Lalamove', false, 20),
    (new_business_id, 'Grab', false, 30),
    (new_business_id, 'PosLaju', true, 40),
    (new_business_id, 'J&T', true, 50),
    (new_business_id, 'Other', false, 60);

  insert into public.production_statuses (
    business_id, code, name, display_order, is_terminal, is_cancelled
  ) values
    (new_business_id, 'new_order', 'New Order', 10, false, false),
    (new_business_id, 'waiting_for_batch', 'Waiting For Batch', 20, false, false),
    (new_business_id, 'scheduled_for_baking', 'Scheduled For Baking', 30, false, false),
    (new_business_id, 'baking', 'Baking', 40, false, false),
    (new_business_id, 'packed', 'Packed', 50, false, false),
    (new_business_id, 'ready_for_delivery', 'Ready For Delivery', 60, false, false),
    (new_business_id, 'delivered', 'Delivered', 70, true, false),
    (new_business_id, 'closed', 'Closed', 80, true, false),
    (new_business_id, 'cancelled', 'Cancelled', 90, true, true);

  return new_business_id;
end;
$$;

revoke execute on function public.create_business_with_defaults(text) from anon, public;
grant execute on function public.create_business_with_defaults(text) to authenticated;
