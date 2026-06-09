begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select has_function(
  'public',
  'save_oms_catalog',
  array['jsonb'],
  'catalog transaction RPC exists'
);
select has_function(
  'public',
  'save_oms_order',
  array['jsonb'],
  'order transaction RPC exists'
);
select has_function(
  'public',
  'archive_oms_order',
  array['uuid', 'integer'],
  'order archive RPC exists'
);
select is(
  public.normalize_customer_phone('012-345 6789'),
  '60123456789',
  'Malaysian phone numbers are normalized'
);

select * from finish();
rollback;
