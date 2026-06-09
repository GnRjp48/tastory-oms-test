create or replace function public.normalize_customer_phone(phone_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(regexp_replace(coalesce(phone_value, ''), '[^0-9]+', '', 'g'), '') is null
      then null
    when regexp_replace(phone_value, '[^0-9]+', '', 'g') like '60%'
      then regexp_replace(phone_value, '[^0-9]+', '', 'g')
    when regexp_replace(phone_value, '[^0-9]+', '', 'g') like '0%'
      then '6' || regexp_replace(phone_value, '[^0-9]+', '', 'g')
    else regexp_replace(phone_value, '[^0-9]+', '', 'g')
  end;
$$;

create or replace function public.save_oms_catalog(catalog jsonb)
returns table (id uuid, legacy_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
  item jsonb;
  target_product_id uuid;
  variant_id uuid;
  current_price_id uuid;
  requested_price numeric(12,2);
  requested_legacy_id text;
begin
  if not public.has_permission('pricing.manage', active_business)
     or not public.has_permission('products.manage', active_business) then
    raise exception 'Product and pricing management permission required';
  end if;

  if jsonb_typeof(catalog) <> 'array' then
    raise exception 'Catalog must be an array';
  end if;

  for item in select value from jsonb_array_elements(catalog)
  loop
    if nullif(trim(item ->> 'flavor'), '') is null
       or nullif(trim(item ->> 'size'), '') is null then
      raise exception 'Every catalog item requires flavor and size';
    end if;

    requested_price := greatest(0, coalesce((item ->> 'price')::numeric, 0));
    requested_legacy_id := nullif(trim(item ->> 'legacy_id'), '');

    insert into public.products (
      business_id, name, is_active, created_by, updated_by
    )
    values (
      active_business, trim(item ->> 'flavor'), true, auth.uid(), auth.uid()
    )
    on conflict (business_id, name) do update
    set is_active = true,
        updated_by = auth.uid(),
        updated_at = now()
    returning public.products.id into target_product_id;

    if nullif(item ->> 'id', '') ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select pv.id
      into variant_id
      from public.product_variants pv
      where pv.id = (item ->> 'id')::uuid
        and pv.business_id = active_business;
    else
      variant_id := null;
    end if;

    if variant_id is null and requested_legacy_id is not null then
      select pv.id
      into variant_id
      from public.product_variants pv
      where pv.business_id = active_business
        and pv.sku = 'LEGACY:' || requested_legacy_id;
    end if;

    if variant_id is null then
      select pv.id
      into variant_id
      from public.product_variants pv
      where pv.business_id = active_business
        and pv.product_id = target_product_id
        and pv.size_label = trim(item ->> 'size');
    end if;

    if variant_id is null then
      insert into public.product_variants (
        business_id, product_id, sku, size_label, is_active, created_by, updated_by
      )
      values (
        active_business,
        target_product_id,
        case when requested_legacy_id is null then null else 'LEGACY:' || requested_legacy_id end,
        trim(item ->> 'size'),
        true,
        auth.uid(),
        auth.uid()
      )
      returning public.product_variants.id into variant_id;
    else
      update public.product_variants
      set product_id = target_product_id,
          size_label = trim(item ->> 'size'),
          sku = coalesce(
            case when requested_legacy_id is null then null else 'LEGACY:' || requested_legacy_id end,
            sku
          ),
          is_active = true,
          updated_by = auth.uid(),
          updated_at = now()
      where public.product_variants.id = variant_id;
    end if;

    select p.id
    into current_price_id
    from public.pricing p
    where p.business_id = active_business
      and p.product_variant_id = variant_id
      and p.valid_to is null;

    if current_price_id is null then
      insert into public.pricing (
        business_id, product_variant_id, amount, created_by
      )
      values (active_business, variant_id, requested_price, auth.uid());
    elsif not exists (
      select 1 from public.pricing
      where public.pricing.id = current_price_id
        and amount = requested_price
    ) then
      update public.pricing
      set valid_to = now()
      where public.pricing.id = current_price_id;

      insert into public.pricing (
        business_id, product_variant_id, amount, created_by
      )
      values (active_business, variant_id, requested_price, auth.uid());
    end if;

    id := variant_id;
    legacy_id := requested_legacy_id;
    return next;
  end loop;
end;
$$;

create or replace function public.save_oms_order(payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
  requested_order_id uuid;
  requested_version integer;
  customer_record public.customers;
  status_record public.production_statuses;
  source_record public.order_sources;
  delivery_record public.delivery_methods;
  resulting_order public.orders;
  order_item jsonb;
  requested_total numeric(12,2) := 0;
  requested_amount_paid numeric(12,2);
  normalized_phone text;
  requested_delivery text;
  delivery_other text;
  requested_created_at timestamptz;
  requested_order_number text;
begin
  if not public.has_permission('orders.create', active_business) then
    raise exception 'Order creation permission required';
  end if;

  requested_order_id := nullif(payload ->> 'order_id', '')::uuid;
  requested_version := nullif(payload ->> 'expected_version', '')::integer;
  normalized_phone := public.normalize_customer_phone(payload ->> 'phone');

  if normalized_phone is null then
    raise exception 'Customer phone is required';
  end if;

  select *
  into customer_record
  from public.customers c
  where c.business_id = active_business
    and c.normalized_phone = normalized_phone;

  if customer_record.id is null then
    insert into public.customers (
      business_id, name, phone, normalized_phone, default_address,
      notes, customer_since, created_by, updated_by
    )
    values (
      active_business,
      trim(payload ->> 'customer_name'),
      trim(payload ->> 'phone'),
      normalized_phone,
      nullif(trim(payload ->> 'address'), ''),
      nullif(trim(payload ->> 'customer_notes'), ''),
      coalesce((payload ->> 'created_at')::timestamptz::date, current_date),
      auth.uid(),
      auth.uid()
    )
    returning * into customer_record;
  else
    update public.customers
    set name = trim(payload ->> 'customer_name'),
        phone = trim(payload ->> 'phone'),
        default_address = nullif(trim(payload ->> 'address'), ''),
        notes = nullif(trim(payload ->> 'customer_notes'), ''),
        updated_by = auth.uid(),
        updated_at = now()
    where id = customer_record.id
    returning * into customer_record;
  end if;

  select *
  into status_record
  from public.production_statuses ps
  where ps.business_id = active_business
    and ps.name = coalesce(nullif(payload ->> 'production_status', ''), 'New Order')
    and ps.is_active = true;

  if status_record.id is null then
    raise exception 'Invalid production status';
  end if;

  select *
  into source_record
  from public.order_sources os
  where os.business_id = active_business and os.name = 'Other';

  requested_delivery := nullif(trim(payload ->> 'delivery_method'), '');
  select *
  into delivery_record
  from public.delivery_methods dm
  where dm.business_id = active_business
    and dm.name = case requested_delivery
      when 'Customer Pickup' then 'Self Pickup'
      else requested_delivery
    end
    and dm.is_active = true;

  if delivery_record.id is null then
    select *
    into delivery_record
    from public.delivery_methods dm
    where dm.business_id = active_business and dm.name = 'Other';
    delivery_other := coalesce(requested_delivery, 'Legacy / unspecified');
  end if;

  if jsonb_typeof(payload -> 'items') <> 'array'
     or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'At least one order item is required';
  end if;

  for order_item in select value from jsonb_array_elements(payload -> 'items')
  loop
    if not exists (
      select 1
      from public.product_variants pv
      where pv.id = (order_item ->> 'product_variant_id')::uuid
        and pv.business_id = active_business
        and pv.is_active = true
    ) then
      raise exception 'Invalid product variant';
    end if;
    requested_total := requested_total
      + greatest(0, (order_item ->> 'quantity')::integer)
      * greatest(0, (order_item ->> 'unit_price')::numeric);
  end loop;

  requested_amount_paid := least(
    requested_total,
    greatest(0, coalesce((payload ->> 'amount_paid')::numeric, 0))
  );
  requested_created_at := coalesce(
    nullif(payload ->> 'created_at', '')::timestamptz,
    now()
  );
  requested_order_number := nullif(trim(payload ->> 'order_number'), '');

  if requested_order_id is null
     and nullif(payload ->> 'legacy_order_id', '') is not null then
    select o.id, o.version
    into requested_order_id, requested_version
    from public.orders o
    where o.business_id = active_business
      and o.legacy_order_id = payload ->> 'legacy_order_id';
  end if;

  if requested_order_id is null then
    if requested_order_number is null then
      perform pg_advisory_xact_lock(hashtext(active_business::text || ':order-number'));
      select 'TAS-' || (
        coalesce(
          max(nullif(regexp_replace(o.order_number, '[^0-9]+', '', 'g'), '')::integer),
          1000
        ) + 1
      )::text
      into requested_order_number
      from public.orders o
      where o.business_id = active_business;
    end if;

    insert into public.orders (
      business_id, order_number, legacy_order_id, customer_id,
      order_source_id, order_source_other, delivery_method_id,
      delivery_method_other, delivery_address, delivery_person,
      tracking_number, latest_delivery_date, actual_delivery_at,
      payment_method, amount_paid, production_status_id, batch_id,
      customer_notes_snapshot, remarks, created_by, updated_by, created_at
    )
    values (
      active_business,
      requested_order_number,
      nullif(payload ->> 'legacy_order_id', ''),
      customer_record.id,
      source_record.id,
      'OMS',
      delivery_record.id,
      delivery_other,
      nullif(trim(payload ->> 'address'), ''),
      nullif(trim(payload ->> 'delivery_person'), ''),
      nullif(trim(payload ->> 'tracking_number'), ''),
      nullif(payload ->> 'latest_delivery_date', '')::date,
      nullif(payload ->> 'actual_delivery_date', '')::date,
      nullif(trim(payload ->> 'payment_method'), ''),
      0,
      status_record.id,
      nullif(trim(payload ->> 'batch_id'), ''),
      nullif(trim(payload ->> 'customer_notes'), ''),
      nullif(trim(payload ->> 'remarks'), ''),
      auth.uid(),
      auth.uid(),
      requested_created_at
    )
    returning * into resulting_order;
  else
    select *
    into resulting_order
    from public.orders o
    where o.id = requested_order_id
      and o.business_id = active_business
    for update;

    if resulting_order.id is null then
      raise exception 'Order not found';
    end if;

    if not public.has_permission('orders.update_all', active_business)
       and not (
         public.has_permission('orders.update_own', active_business)
         and (
           resulting_order.created_by = auth.uid()
           or resulting_order.assigned_sales_user_id = auth.uid()
         )
       ) then
      raise exception 'Order update permission required';
    end if;

    if requested_version is not null and resulting_order.version <> requested_version then
      raise exception 'Order was updated by another user';
    end if;

    update public.orders
    set customer_id = customer_record.id,
        delivery_method_id = delivery_record.id,
        delivery_method_other = delivery_other,
        delivery_address = nullif(trim(payload ->> 'address'), ''),
        delivery_person = nullif(trim(payload ->> 'delivery_person'), ''),
        tracking_number = nullif(trim(payload ->> 'tracking_number'), ''),
        latest_delivery_date = nullif(payload ->> 'latest_delivery_date', '')::date,
        actual_delivery_at = nullif(payload ->> 'actual_delivery_date', '')::date,
        payment_method = nullif(trim(payload ->> 'payment_method'), ''),
        amount_paid = 0,
        production_status_id = status_record.id,
        batch_id = nullif(trim(payload ->> 'batch_id'), ''),
        customer_notes_snapshot = nullif(trim(payload ->> 'customer_notes'), ''),
        remarks = nullif(trim(payload ->> 'remarks'), ''),
        version = version + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where id = requested_order_id
    returning * into resulting_order;

    delete from public.order_items where order_id = resulting_order.id;
  end if;

  for order_item in select value from jsonb_array_elements(payload -> 'items')
  loop
    insert into public.order_items (
      business_id, order_id, product_variant_id,
      product_name_snapshot, variant_name_snapshot, quantity, unit_price
    )
    select
      active_business,
      resulting_order.id,
      pv.id,
      p.name,
      pv.size_label,
      (order_item ->> 'quantity')::integer,
      (order_item ->> 'unit_price')::numeric
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (order_item ->> 'product_variant_id')::uuid;
  end loop;

  update public.orders
  set amount_paid = requested_amount_paid,
      updated_by = auth.uid(),
      updated_at = now()
  where id = resulting_order.id
  returning * into resulting_order;

  return resulting_order;
end;
$$;

create or replace function public.archive_oms_order(
  requested_order_id uuid,
  expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
begin
  if not public.has_permission('orders.archive', active_business) then
    raise exception 'Order archive permission required';
  end if;

  update public.orders
  set archived_at = now(),
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where id = requested_order_id
    and business_id = active_business
    and version = expected_version;

  if not found then
    raise exception 'Order not found or updated by another user';
  end if;
end;
$$;

revoke execute on function public.normalize_customer_phone(text) from anon, public;
revoke execute on function public.save_oms_catalog(jsonb) from anon, public;
revoke execute on function public.save_oms_order(jsonb) from anon, public;
revoke execute on function public.archive_oms_order(uuid, integer) from anon, public;

grant execute on function public.normalize_customer_phone(text) to authenticated;
grant execute on function public.save_oms_catalog(jsonb) to authenticated;
grant execute on function public.save_oms_order(jsonb) to authenticated;
grant execute on function public.archive_oms_order(uuid, integer) to authenticated;
