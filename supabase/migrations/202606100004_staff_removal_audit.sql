create or replace function public.remove_staff_member(requested_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
  target_is_admin boolean;
  target_email text;
  target_full_name text;
  target_active_business_id uuid;
  target_was_active boolean;
  target_role_code text;
begin
  perform public.assert_staff_admin(active_business);

  if requested_user_id = auth.uid() then
    raise exception 'You cannot remove your own account';
  end if;

  select
    u.email,
    u.full_name,
    u.active_business_id,
    u.is_active,
    r.code
  into
    target_email,
    target_full_name,
    target_active_business_id,
    target_was_active,
    target_role_code
  from public.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.roles r on r.id = ur.role_id
  where ur.business_id = active_business
    and u.id = requested_user_id
  limit 1;

  if target_role_code is null then
    raise exception 'Staff member not found';
  end if;

  target_is_admin := target_role_code = 'admin';

  if target_is_admin and public.active_admin_count(active_business) <= 1 then
    raise exception 'The last active Admin cannot be removed';
  end if;

  delete from public.user_roles
  where business_id = active_business
    and user_id = requested_user_id;

  update public.users
  set active_business_id = case
        when active_business_id = active_business then null
        else active_business_id
      end,
      is_active = false,
      updated_at = now()
  where id = requested_user_id;

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
    active_business,
    auth.uid(),
    'staff_removed',
    'users',
    requested_user_id::text,
    jsonb_build_object(
      'email', target_email,
      'full_name', target_full_name,
      'active_business_id', target_active_business_id,
      'is_active', target_was_active,
      'role_code', target_role_code
    ),
    jsonb_build_object(
      'active_business_id', null,
      'is_active', false,
      'role_code', null
    ),
    jsonb_build_object(
      'auth_user_retained', true,
      'profile_retained', true,
      'historical_activity_retained', true
    )
  );
end;
$$;

revoke execute on function public.remove_staff_member(uuid) from anon, public;
grant execute on function public.remove_staff_member(uuid) to authenticated;
