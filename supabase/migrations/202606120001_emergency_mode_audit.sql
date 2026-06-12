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
    'local_data_exported'
  ) then
    raise exception 'Unsupported client event';
  end if;

  insert into public.activity_logs (
    business_id,
    actor_user_id,
    action,
    table_name,
    record_id,
    metadata
  )
  values (
    active_business,
    auth.uid(),
    requested_action,
    'oms_client',
    auth.uid()::text,
    coalesce(requested_metadata, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.log_oms_client_event(text, jsonb) from anon, public;
grant execute on function public.log_oms_client_event(text, jsonb) to authenticated;
