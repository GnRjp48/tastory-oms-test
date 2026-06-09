alter table public.businesses enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.business_settings enable row level security;
alter table public.customer_tags enable row level security;
alter table public.customers enable row level security;
alter table public.customer_tag_assignments enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.pricing enable row level security;
alter table public.order_sources enable row level security;
alter table public.delivery_methods enable row level security;
alter table public.production_statuses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.migration_runs enable row level security;
alter table public.migration_records enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant update (name, timezone, currency_code, is_active, updated_at)
  on public.businesses to authenticated;
grant update (full_name, phone, is_active, last_seen_at, updated_at)
  on public.users to authenticated;
grant insert (
  business_id, name, phone, normalized_phone, email, default_address,
  status, notes, preferences, customer_since, created_by, updated_by
) on public.customers to authenticated;
grant update (
  name, phone, normalized_phone, email, default_address,
  notes, preferences, updated_by, updated_at
) on public.customers to authenticated;
grant insert, update, delete on public.customer_tags to authenticated;
grant insert, delete on public.customer_tag_assignments to authenticated;
grant insert, update on public.products to authenticated;
grant insert, update on public.product_variants to authenticated;
grant insert, update on public.pricing to authenticated;
grant insert, update on public.order_sources to authenticated;
grant insert, update on public.delivery_methods to authenticated;
grant insert, update on public.production_statuses to authenticated;
grant insert, update on public.inventory to authenticated;
grant insert on public.inventory_movements to authenticated;
grant update on public.business_settings to authenticated;
grant insert, update, delete on public.user_roles to authenticated;
grant insert, update on public.migration_records to authenticated;

create policy businesses_select_member
on public.businesses for select to authenticated
using (public.is_business_member(id));

create policy businesses_update_admin
on public.businesses for update to authenticated
using (public.has_permission('settings.manage', id))
with check (public.has_permission('settings.manage', id));

create policy users_select_self_or_admin
on public.users for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = public.users.id
      and ur.business_id = public.current_business_id()
      and public.has_permission('users.manage', ur.business_id)
  )
);

create policy users_update_admin
on public.users for update to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = public.users.id
      and ur.business_id = public.current_business_id()
      and public.has_permission('users.manage', ur.business_id)
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = public.users.id
      and ur.business_id = public.current_business_id()
      and public.has_permission('users.manage', ur.business_id)
  )
);

create policy users_update_self
on public.users for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy roles_select_authenticated
on public.roles for select to authenticated
using (true);

create policy permissions_select_authenticated
on public.permissions for select to authenticated
using (true);

create policy role_permissions_select_authenticated
on public.role_permissions for select to authenticated
using (true);

create policy user_roles_select_member
on public.user_roles for select to authenticated
using (
  user_id = auth.uid()
  or public.is_business_member(business_id)
);

create policy user_roles_insert_admin
on public.user_roles for insert to authenticated
with check (
  public.has_permission('roles.manage', business_id)
  and assigned_by = auth.uid()
);

create policy user_roles_update_admin
on public.user_roles for update to authenticated
using (public.has_permission('roles.manage', business_id))
with check (public.has_permission('roles.manage', business_id));

create policy user_roles_delete_admin
on public.user_roles for delete to authenticated
using (public.has_permission('roles.manage', business_id));

create policy business_settings_select_member
on public.business_settings for select to authenticated
using (public.is_business_member(business_id));

create policy business_settings_update_admin
on public.business_settings for update to authenticated
using (public.has_permission('settings.manage', business_id))
with check (
  public.has_permission('settings.manage', business_id)
  and updated_by = auth.uid()
);

create policy customer_tags_select
on public.customer_tags for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('customers.read', business_id)
);

create policy customer_tags_insert
on public.customer_tags for insert to authenticated
with check (
  business_id = public.current_business_id()
  and public.has_permission('customer_tags.manage', business_id)
  and created_by = auth.uid()
);

create policy customer_tags_update
on public.customer_tags for update to authenticated
using (public.has_permission('customer_tags.manage', business_id))
with check (public.has_permission('customer_tags.manage', business_id));

create policy customer_tags_delete
on public.customer_tags for delete to authenticated
using (public.has_permission('customer_tags.manage', business_id));

create policy customers_select
on public.customers for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('customers.read', business_id)
);

create policy customers_insert
on public.customers for insert to authenticated
with check (
  business_id = public.current_business_id()
  and public.has_permission('customers.create', business_id)
  and created_by = auth.uid()
);

create policy customers_update
on public.customers for update to authenticated
using (public.has_permission('customers.update', business_id))
with check (
  business_id = public.current_business_id()
  and public.has_permission('customers.update', business_id)
  and updated_by = auth.uid()
);

create or replace function public.set_customer_status(
  requested_customer_id uuid,
  requested_status public.customer_status
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  resulting_customer public.customers;
begin
  update public.customers
  set status = requested_status,
      updated_by = auth.uid(),
      updated_at = now()
  where id = requested_customer_id
    and business_id = public.current_business_id()
    and public.has_permission('customers.status_manage', business_id)
  returning * into resulting_customer;

  if resulting_customer.id is null then
    raise exception 'Customer not found or permission denied';
  end if;

  return resulting_customer;
end;
$$;

revoke execute on function public.set_customer_status(uuid, public.customer_status)
  from anon, public;
grant execute on function public.set_customer_status(uuid, public.customer_status)
  to authenticated;

create policy customer_tag_assignments_select
on public.customer_tag_assignments for select to authenticated
using (
  exists (
    select 1
    from public.customers c
    where c.id = customer_id
      and c.business_id = public.current_business_id()
      and public.has_permission('customers.read', c.business_id)
  )
);

create policy customer_tag_assignments_insert
on public.customer_tag_assignments for insert to authenticated
with check (
  assigned_by = auth.uid()
  and exists (
    select 1
    from public.customers c
    join public.customer_tags t on t.id = tag_id
    where c.id = customer_id
      and c.business_id = t.business_id
      and c.business_id = public.current_business_id()
      and public.has_permission('customer_tags.assign', c.business_id)
  )
);

create policy customer_tag_assignments_delete
on public.customer_tag_assignments for delete to authenticated
using (
  exists (
    select 1
    from public.customers c
    where c.id = customer_id
      and public.has_permission('customer_tags.assign', c.business_id)
  )
);

create policy products_select
on public.products for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('products.read', business_id)
);

create policy products_write
on public.products for all to authenticated
using (public.has_permission('products.manage', business_id))
with check (
  business_id = public.current_business_id()
  and public.has_permission('products.manage', business_id)
);

create policy product_variants_select
on public.product_variants for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('products.read', business_id)
);

create policy product_variants_write
on public.product_variants for all to authenticated
using (public.has_permission('products.manage', business_id))
with check (
  business_id = public.current_business_id()
  and public.has_permission('products.manage', business_id)
);

create policy pricing_select
on public.pricing for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('pricing.read', business_id)
);

create policy pricing_write
on public.pricing for all to authenticated
using (public.has_permission('pricing.manage', business_id))
with check (
  business_id = public.current_business_id()
  and public.has_permission('pricing.manage', business_id)
);

create policy order_sources_select
on public.order_sources for select to authenticated
using (business_id = public.current_business_id() and public.is_business_member(business_id));

create policy order_sources_write
on public.order_sources for all to authenticated
using (public.has_permission('settings.manage', business_id))
with check (public.has_permission('settings.manage', business_id));

create policy delivery_methods_select
on public.delivery_methods for select to authenticated
using (business_id = public.current_business_id() and public.is_business_member(business_id));

create policy delivery_methods_write
on public.delivery_methods for all to authenticated
using (public.has_permission('settings.manage', business_id))
with check (public.has_permission('settings.manage', business_id));

create policy production_statuses_select
on public.production_statuses for select to authenticated
using (business_id = public.current_business_id() and public.is_business_member(business_id));

create policy production_statuses_write
on public.production_statuses for all to authenticated
using (public.has_permission('settings.manage', business_id))
with check (public.has_permission('settings.manage', business_id));

create policy orders_select
on public.orders for select to authenticated
using (
  business_id = public.current_business_id()
  and (
    public.has_permission('orders.read_all', business_id)
    or (
      public.has_permission('orders.read_own', business_id)
      and (created_by = auth.uid() or assigned_sales_user_id = auth.uid())
    )
    or (
      public.has_permission('orders.read_assigned', business_id)
      and assigned_production_user_id = auth.uid()
    )
  )
);

create policy orders_insert
on public.orders for insert to authenticated
with check (
  business_id = public.current_business_id()
  and public.has_permission('orders.create', business_id)
  and created_by = auth.uid()
);

create policy orders_update_manager
on public.orders for update to authenticated
using (public.has_permission('orders.update_all', business_id))
with check (
  business_id = public.current_business_id()
  and public.has_permission('orders.update_all', business_id)
  and updated_by = auth.uid()
);

create policy orders_update_sales
on public.orders for update to authenticated
using (
  public.has_permission('orders.update_own', business_id)
  and (created_by = auth.uid() or assigned_sales_user_id = auth.uid())
)
with check (
  business_id = public.current_business_id()
  and public.has_permission('orders.update_own', business_id)
  and (created_by = auth.uid() or assigned_sales_user_id = auth.uid())
  and updated_by = auth.uid()
);

create policy order_items_select
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.business_id = public.current_business_id()
      and (
        public.has_permission('orders.read_all', o.business_id)
        or (public.has_permission('orders.read_own', o.business_id)
            and (o.created_by = auth.uid() or o.assigned_sales_user_id = auth.uid()))
        or (public.has_permission('orders.read_assigned', o.business_id)
            and o.assigned_production_user_id = auth.uid())
      )
  )
);

create policy order_items_insert
on public.order_items for insert to authenticated
with check (
  business_id = public.current_business_id()
  and exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.business_id = business_id
      and (
        public.has_permission('orders.update_all', o.business_id)
        or (public.has_permission('orders.update_own', o.business_id)
            and (o.created_by = auth.uid() or o.assigned_sales_user_id = auth.uid()))
      )
  )
);

create policy order_items_update
on public.order_items for update to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (
        public.has_permission('orders.update_all', o.business_id)
        or (public.has_permission('orders.update_own', o.business_id)
            and (o.created_by = auth.uid() or o.assigned_sales_user_id = auth.uid()))
      )
  )
);

create policy order_items_delete
on public.order_items for delete to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (
        public.has_permission('orders.update_all', o.business_id)
        or (public.has_permission('orders.update_own', o.business_id)
            and (o.created_by = auth.uid() or o.assigned_sales_user_id = auth.uid()))
      )
  )
);

create policy order_status_history_select
on public.order_status_history for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('production.read', business_id)
);

create policy inventory_select
on public.inventory for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('inventory.read', business_id)
);

create policy inventory_write
on public.inventory for all to authenticated
using (public.has_permission('inventory.manage', business_id))
with check (
  business_id = public.current_business_id()
  and public.has_permission('inventory.manage', business_id)
);

create policy inventory_movements_select
on public.inventory_movements for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('inventory.read', business_id)
);

create policy inventory_movements_insert
on public.inventory_movements for insert to authenticated
with check (
  business_id = public.current_business_id()
  and public.has_permission('inventory.manage', business_id)
  and created_by = auth.uid()
);

create policy activity_logs_select_admin
on public.activity_logs for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('activity.read', business_id)
);

create policy migration_runs_select
on public.migration_runs for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('migrations.manage', business_id)
);

create policy migration_records_select
on public.migration_records for select to authenticated
using (
  exists (
    select 1 from public.migration_runs mr
    where mr.id = migration_run_id
      and public.has_permission('migrations.manage', mr.business_id)
  )
);

create policy migration_records_write
on public.migration_records for all to authenticated
using (
  exists (
    select 1 from public.migration_runs mr
    where mr.id = migration_run_id
      and public.has_permission('migrations.manage', mr.business_id)
  )
)
with check (
  exists (
    select 1 from public.migration_runs mr
    where mr.id = migration_run_id
      and public.has_permission('migrations.manage', mr.business_id)
  )
);

create or replace function public.set_active_business(requested_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_business_member(requested_business_id) then
    raise exception 'User is not a member of this business';
  end if;

  update public.users
  set active_business_id = requested_business_id,
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke execute on function public.set_active_business(uuid) from anon, public;
grant execute on function public.set_active_business(uuid) to authenticated;

create or replace function public.advance_production_status(
  requested_order_id uuid,
  requested_status_id uuid,
  expected_version integer,
  status_comment text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders;
  previous_status_id uuid;
  resulting_order public.orders;
begin
  select *
  into current_order
  from public.orders
  where id = requested_order_id
  for update;

  if current_order.id is null then
    raise exception 'Order not found';
  end if;

  if current_order.business_id <> public.current_business_id() then
    raise exception 'Order is outside the active business';
  end if;

  if not public.has_permission('production.update', current_order.business_id) then
    raise exception 'Insufficient production permission';
  end if;

  if public.has_role('production_staff', current_order.business_id)
     and not public.has_permission('orders.update_all', current_order.business_id)
     and current_order.assigned_production_user_id is distinct from auth.uid() then
    raise exception 'Order is not assigned to this production user';
  end if;

  if not exists (
    select 1 from public.production_statuses ps
    where ps.id = requested_status_id
      and ps.business_id = current_order.business_id
      and ps.is_active = true
  ) then
    raise exception 'Invalid production status';
  end if;

  if current_order.version <> expected_version then
    raise exception 'Order was updated by another user';
  end if;

  previous_status_id := current_order.production_status_id;

  update public.orders
  set production_status_id = requested_status_id,
      actual_delivery_at = case
        when exists (
          select 1 from public.production_statuses
          where id = requested_status_id and code = 'delivered'
        ) then coalesce(actual_delivery_at, now())
        else actual_delivery_at
      end,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = requested_order_id
    and version = expected_version
  returning * into resulting_order;

  if resulting_order.id is null then
    raise exception 'Concurrent order update detected';
  end if;

  insert into public.order_status_history (
    business_id,
    order_id,
    from_status_id,
    to_status_id,
    comment,
    changed_by
  )
  values (
    current_order.business_id,
    requested_order_id,
    previous_status_id,
    requested_status_id,
    status_comment,
    auth.uid()
  );

  return resulting_order;
end;
$$;

revoke execute on function public.advance_production_status(uuid, uuid, integer, text)
  from anon, public;
grant execute on function public.advance_production_status(uuid, uuid, integer, text) to authenticated;

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.order_status_history;
alter publication supabase_realtime add table public.inventory;
