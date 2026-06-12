do $migration$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef('public.restore_oms_backup(jsonb,text)'::regprocedure)
  into definition;

  corrected := replace(
    definition,
    'restored_staff integer := 0;',
    'restored_staff integer := 0;
  new_order_ids uuid[] := ''{}''::uuid[];'
  );
  corrected := replace(
    corrected,
    '  create temporary table restore_new_orders (id uuid primary key) on commit drop;
',
    ''
  );
  corrected := replace(
    corrected,
    '      insert into restore_new_orders (id) values ((row_data ->> ''id'')::uuid) on conflict do nothing;',
    '      new_order_ids := array_append(new_order_ids, (row_data ->> ''id'')::uuid);'
  );
  corrected := replace(
    corrected,
    'or exists (select 1 from restore_new_orders n where n.id = public.orders.id)',
    'or public.orders.id = any(new_order_ids)'
  );

  if corrected = definition then
    raise exception 'restore_oms_backup correction did not match the deployed function';
  end if;

  execute corrected;
end;
$migration$;
