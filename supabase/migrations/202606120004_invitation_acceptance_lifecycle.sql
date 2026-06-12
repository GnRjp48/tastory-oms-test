create or replace function public.list_staff_management()
returns table (
  record_type text,
  user_id uuid,
  invitation_id uuid,
  full_name text,
  email text,
  role_code text,
  role_name text,
  status text,
  invitation_status text,
  invited_at timestamptz,
  accepted_at timestamptz,
  last_login_at timestamptz,
  is_current_user boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
begin
  perform public.assert_staff_admin(active_business);

  return query
  select
    'staff'::text,
    u.id,
    pending_invitation.id,
    coalesce(u.full_name, au.raw_user_meta_data ->> 'full_name', u.email),
    coalesce(u.email, au.email),
    r.code,
    r.name,
    case
      when pending_invitation.id is not null then 'pending'
      when u.is_active then 'active'
      else 'inactive'
    end,
    case
      when pending_invitation.id is not null then 'pending'
      else 'accepted'
    end,
    pending_invitation.invited_at,
    accepted_invitation.accepted_at,
    coalesce(au.last_sign_in_at, u.last_seen_at),
    u.id = auth.uid()
  from public.user_roles ur
  join public.users u on u.id = ur.user_id
  join public.roles r on r.id = ur.role_id
  left join auth.users au on au.id = u.id
  left join lateral (
    select si.*
    from public.staff_invitations si
    where si.business_id = ur.business_id
      and si.user_id = u.id
      and si.status = 'pending'
    order by si.invited_at desc
    limit 1
  ) pending_invitation on true
  left join lateral (
    select si.accepted_at
    from public.staff_invitations si
    where si.business_id = ur.business_id
      and si.user_id = u.id
      and si.status = 'accepted'
    order by si.accepted_at desc nulls last
    limit 1
  ) accepted_invitation on true
  where ur.business_id = active_business

  union all

  select
    'invitation'::text,
    si.user_id,
    si.id,
    si.full_name,
    si.email,
    r.code,
    r.name,
    'pending'::text,
    si.status::text,
    si.invited_at,
    si.accepted_at,
    null::timestamptz,
    false
  from public.staff_invitations si
  join public.roles r on r.id = si.role_id
  where si.business_id = active_business
    and si.status = 'pending'
    and not exists (
      select 1
      from public.user_roles ur
      where ur.business_id = si.business_id
        and ur.user_id = si.user_id
    )
  order by 8, 4;
end;
$$;

create or replace function public.complete_staff_invitation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.staff_invitations
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where user_id = auth.uid()
    and status = 'pending';

  get diagnostics completed_count = row_count;
  return completed_count > 0;
end;
$$;

revoke execute on function public.complete_staff_invitation() from anon, public;
grant execute on function public.complete_staff_invitation() to authenticated;
