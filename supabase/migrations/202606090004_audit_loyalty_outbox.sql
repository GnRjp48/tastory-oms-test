create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_data jsonb;
  new_data jsonb;
  resolved_business_id uuid;
  resolved_record_id text;
begin
  old_data := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_data := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  resolved_business_id := coalesce(
    nullif(new_data ->> 'business_id', '')::uuid,
    nullif(old_data ->> 'business_id', '')::uuid
  );
  resolved_record_id := coalesce(
    new_data ->> 'id',
    old_data ->> 'id',
    new_data ->> 'order_id',
    old_data ->> 'order_id',
    new_data ->> 'user_id',
    old_data ->> 'user_id'
  );

  insert into public.activity_logs (
    business_id,
    actor_user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    metadata
  )
  values (
    resolved_business_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    resolved_record_id,
    old_data,
    new_data,
    jsonb_build_object('schema', tg_table_schema)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_business_settings
after insert or update or delete on public.business_settings
for each row execute function public.audit_row_change();

create trigger audit_user_roles
after insert or update or delete on public.user_roles
for each row execute function public.audit_row_change();

create trigger audit_customer_tags
after insert or update or delete on public.customer_tags
for each row execute function public.audit_row_change();

create trigger audit_customers
after insert or update or delete on public.customers
for each row execute function public.audit_row_change();

create trigger audit_products
after insert or update or delete on public.products
for each row execute function public.audit_row_change();

create trigger audit_product_variants
after insert or update or delete on public.product_variants
for each row execute function public.audit_row_change();

create trigger audit_pricing
after insert or update or delete on public.pricing
for each row execute function public.audit_row_change();

create trigger audit_orders
after insert or update or delete on public.orders
for each row execute function public.audit_row_change();

create trigger audit_inventory
after insert or update or delete on public.inventory
for each row execute function public.audit_row_change();

create trigger audit_inventory_movements
after insert or update or delete on public.inventory_movements
for each row execute function public.audit_row_change();

create or replace function public.refresh_customer_loyalty(requested_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_order_count integer;
  completed_total numeric(14,2);
  latest_completed_order date;
  first_order_date date;
begin
  select
    count(*)::integer,
    coalesce(sum(o.total_amount), 0)::numeric(14,2),
    max(coalesce(o.actual_delivery_at, o.created_at)::date),
    min(o.created_at::date)
  into
    completed_order_count,
    completed_total,
    latest_completed_order,
    first_order_date
  from public.orders o
  join public.production_statuses ps on ps.id = o.production_status_id
  where o.customer_id = requested_customer_id
    and o.archived_at is null
    and ps.code in ('delivered', 'closed');

  update public.customers
  set total_orders = completed_order_count,
      total_spent = completed_total,
      last_order_date = latest_completed_order,
      customer_since = least(customer_since, coalesce(first_order_date, customer_since)),
      updated_at = now()
  where id = requested_customer_id;
end;
$$;

create or replace function public.refresh_customer_loyalty_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_customer_loyalty(old.customer_id);
    return old;
  end if;

  perform public.refresh_customer_loyalty(new.customer_id);

  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    perform public.refresh_customer_loyalty(old.customer_id);
  end if;

  return new;
end;
$$;

create trigger orders_refresh_customer_loyalty
after insert or update or delete on public.orders
for each row execute function public.refresh_customer_loyalty_trigger();

create or replace function public.recalculate_order_totals(requested_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  calculated_subtotal numeric(12,2);
begin
  select coalesce(sum(line_total), 0)
  into calculated_subtotal
  from public.order_items
  where order_id = requested_order_id;

  update public.orders
  set subtotal = calculated_subtotal,
      total_amount = greatest(
        0,
        calculated_subtotal + delivery_fee + tax_amount - discount_amount
      ),
      updated_at = now()
  where id = requested_order_id;
end;
$$;

create or replace function public.recalculate_order_totals_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_order_totals(old.order_id);
    return old;
  end if;

  perform public.recalculate_order_totals(new.order_id);

  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public.recalculate_order_totals(old.order_id);
  end if;

  return new;
end;
$$;

create trigger order_items_recalculate_totals
after insert or update or delete on public.order_items
for each row execute function public.recalculate_order_totals_trigger();

create or replace function public.normalize_order_payment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.payment_status := case
    when new.amount_paid <= 0 then 'unpaid'::public.payment_status
    when new.amount_paid >= new.total_amount then 'paid'::public.payment_status
    else 'deposit_paid'::public.payment_status
  end;
  return new;
end;
$$;

create trigger orders_normalize_payment_status
before insert or update on public.orders
for each row execute function public.normalize_order_payment_status();

create or replace function public.enqueue_order_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_name text;
  event_key text;
begin
  if tg_op = 'INSERT' then
    event_name := 'order.created';
  elsif old.production_status_id is distinct from new.production_status_id then
    event_name := 'production.status_changed';
  else
    return new;
  end if;

  event_key := event_name || ':' || new.id::text || ':' || new.version::text;

  insert into public.notification_outbox (
    business_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    idempotency_key
  )
  values (
    new.business_id,
    event_name,
    'order',
    new.id,
    jsonb_build_object(
      'order_id', new.id,
      'order_number', new.order_number,
      'customer_id', new.customer_id,
      'production_status_id', new.production_status_id,
      'total_amount', new.total_amount,
      'amount_paid', new.amount_paid,
      'version', new.version,
      'occurred_at', now()
    ),
    event_key
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

create trigger orders_enqueue_events
after insert or update on public.orders
for each row execute function public.enqueue_order_events();

create or replace function public.validate_order_references()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_name text;
  delivery_name text;
  tracking_required boolean;
begin
  if new.order_source_id is not null then
    select name into source_name
    from public.order_sources
    where id = new.order_source_id
      and business_id = new.business_id
      and is_active = true;

    if source_name is null then
      raise exception 'Invalid order source';
    end if;

    if source_name = 'Other' and nullif(trim(new.order_source_other), '') is null then
      raise exception 'Other order source must be specified';
    end if;
  end if;

  if new.delivery_method_id is not null then
    select name, requires_tracking
    into delivery_name, tracking_required
    from public.delivery_methods
    where id = new.delivery_method_id
      and business_id = new.business_id
      and is_active = true;

    if delivery_name is null then
      raise exception 'Invalid delivery method';
    end if;

    if delivery_name = 'Other' and nullif(trim(new.delivery_method_other), '') is null then
      raise exception 'Other delivery method must be specified';
    end if;

    if tracking_required and nullif(trim(new.tracking_number), '') is null then
      raise exception 'Tracking number is required for this delivery method';
    end if;
  end if;

  return new;
end;
$$;

create trigger orders_validate_references
before insert or update on public.orders
for each row execute function public.validate_order_references();

revoke execute on function public.audit_row_change() from authenticated, anon, public;
revoke execute on function public.refresh_customer_loyalty(uuid) from authenticated, anon, public;
revoke execute on function public.refresh_customer_loyalty_trigger() from authenticated, anon, public;
revoke execute on function public.recalculate_order_totals(uuid) from authenticated, anon, public;
revoke execute on function public.recalculate_order_totals_trigger() from authenticated, anon, public;
revoke execute on function public.enqueue_order_events() from authenticated, anon, public;
