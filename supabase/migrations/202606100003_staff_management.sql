create type public.staff_invitation_status as enum ('pending', 'accepted', 'cancelled');

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  email text not null,
  full_name text not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  status public.staff_invitation_status not null default 'pending',
  invited_by uuid not null references public.users(id),
  invited_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id),
  send_count integer not null default 1 check (send_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index staff_invitations_one_pending_email
  on public.staff_invitations (business_id, lower(email))
  where status = 'pending';

create index staff_invitations_business_status_idx
  on public.staff_invitations (business_id, status, invited_at desc);

create trigger staff_invitations_set_updated_at
before update on public.staff_invitations
for each row execute function public.set_updated_at();

alter table public.staff_invitations enable row level security;
revoke all on public.staff_invitations from anon, authenticated;
revoke insert, update, delete on public.user_roles from authenticated;
revoke update on public.users from authenticated;
grant update (full_name, phone, last_seen_at, updated_at)
  on public.users to authenticated;

create policy staff_invitations_admin_select
on public.staff_invitations for select to authenticated
using (
  business_id = public.current_business_id()
  and public.has_permission('users.manage', business_id)
);

create trigger audit_staff_invitations
after insert or update or delete on public.staff_invitations
for each row execute function public.audit_row_change();

create or replace function public.assert_staff_admin(
  requested_business_id uuid default public.current_business_id()
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if requested_business_id is null
     or requested_business_id <> public.current_business_id()
     or not public.has_permission('users.manage', requested_business_id) then
    raise exception 'Admin permission required';
  end if;
end;
$$;

create or replace function public.active_admin_count(requested_business_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct ur.user_id)::integer
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.users u on u.id = ur.user_id
  where ur.business_id = requested_business_id
    and r.code = 'admin'
    and u.is_active = true;
$$;

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

  update public.staff_invitations si
  set status = 'accepted',
      accepted_at = coalesce(si.accepted_at, au.email_confirmed_at, au.last_sign_in_at, now()),
      updated_at = now()
  from auth.users au
  where si.business_id = active_business
    and si.status = 'pending'
    and si.user_id = au.id
    and (au.email_confirmed_at is not null or au.last_sign_in_at is not null);

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
      when pending_invitation.id is not null
           and au.email_confirmed_at is null
           and au.last_sign_in_at is null then 'pending'
      when u.is_active then 'active'
      else 'inactive'
    end,
    coalesce(pending_invitation.status::text, 'accepted'),
    pending_invitation.invited_at,
    coalesce(pending_invitation.accepted_at, au.email_confirmed_at),
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

create or replace function public.change_staff_role(
  requested_user_id uuid,
  requested_role_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
  current_role_code text;
  requested_role_id uuid;
begin
  perform public.assert_staff_admin(active_business);

  if requested_role_code not in ('admin', 'manager', 'sales_staff', 'production_staff') then
    raise exception 'Unsupported staff role';
  end if;

  select r.code
  into current_role_code
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.business_id = active_business
    and ur.user_id = requested_user_id
  limit 1;

  if current_role_code is null then
    raise exception 'Staff member not found';
  end if;

  if current_role_code = 'admin'
     and requested_role_code <> 'admin'
     and public.active_admin_count(active_business) <= 1 then
    raise exception 'The last active Admin cannot be demoted';
  end if;

  select id into requested_role_id
  from public.roles
  where code = requested_role_code;

  delete from public.user_roles
  where business_id = active_business
    and user_id = requested_user_id;

  insert into public.user_roles (business_id, user_id, role_id, assigned_by)
  values (active_business, requested_user_id, requested_role_id, auth.uid());

  update public.staff_invitations
  set role_id = requested_role_id,
      updated_at = now()
  where business_id = active_business
    and user_id = requested_user_id
    and status = 'pending';
end;
$$;

create or replace function public.set_staff_active(
  requested_user_id uuid,
  requested_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
  target_is_admin boolean;
begin
  perform public.assert_staff_admin(active_business);

  if requested_user_id = auth.uid() and not requested_active then
    raise exception 'You cannot deactivate your own account';
  end if;

  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.business_id = active_business
      and ur.user_id = requested_user_id
      and r.code = 'admin'
  ) into target_is_admin;

  if not exists (
    select 1 from public.user_roles
    where business_id = active_business and user_id = requested_user_id
  ) then
    raise exception 'Staff member not found';
  end if;

  if not requested_active
     and target_is_admin
     and public.active_admin_count(active_business) <= 1 then
    raise exception 'The last active Admin cannot be deactivated';
  end if;

  update public.users
  set is_active = requested_active,
      updated_at = now()
  where id = requested_user_id;
end;
$$;

create or replace function public.remove_staff_member(requested_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid := public.current_business_id();
  target_is_admin boolean;
begin
  perform public.assert_staff_admin(active_business);

  if requested_user_id = auth.uid() then
    raise exception 'You cannot remove your own account';
  end if;

  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.business_id = active_business
      and ur.user_id = requested_user_id
      and r.code = 'admin'
  ) into target_is_admin;

  if not exists (
    select 1 from public.user_roles
    where business_id = active_business and user_id = requested_user_id
  ) then
    raise exception 'Staff member not found';
  end if;

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
end;
$$;

create or replace function public.touch_staff_session()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.users
  set last_seen_at = now(),
      updated_at = now()
  where id = auth.uid()
    and is_active = true;

  if not found then
    raise exception 'This staff account is inactive';
  end if;

  update public.staff_invitations si
  set status = 'accepted',
      accepted_at = coalesce(si.accepted_at, now()),
      updated_at = now()
  where si.user_id = auth.uid()
    and si.status = 'pending';
end;
$$;

revoke execute on function public.assert_staff_admin(uuid) from authenticated, anon, public;
revoke execute on function public.active_admin_count(uuid) from authenticated, anon, public;
revoke execute on function public.list_staff_management() from anon, public;
revoke execute on function public.change_staff_role(uuid, text) from anon, public;
revoke execute on function public.set_staff_active(uuid, boolean) from anon, public;
revoke execute on function public.remove_staff_member(uuid) from anon, public;
revoke execute on function public.touch_staff_session() from anon, public;

grant execute on function public.list_staff_management() to authenticated;
grant execute on function public.change_staff_role(uuid, text) to authenticated;
grant execute on function public.set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.remove_staff_member(uuid) to authenticated;
grant execute on function public.touch_staff_session() to authenticated;
