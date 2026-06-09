do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.save_oms_order(jsonb)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'normalized_phone text;',
    'customer_phone_normalized text;'
  );
  function_definition := replace(
    function_definition,
    'normalized_phone := public.normalize_customer_phone',
    'customer_phone_normalized := public.normalize_customer_phone'
  );
  function_definition := replace(
    function_definition,
    'if normalized_phone is null then',
    'if customer_phone_normalized is null then'
  );
  function_definition := replace(
    function_definition,
    'c.normalized_phone = normalized_phone;',
    'c.normalized_phone = customer_phone_normalized;'
  );
  function_definition := replace(
    function_definition,
    E'trim(payload ->> ''phone''),\n      normalized_phone,\n',
    E'trim(payload ->> ''phone''),\n      customer_phone_normalized,\n'
  );

  execute function_definition;
end;
$migration$;
