alter table public.staff_invitations
add column reused_auth_identity boolean not null default false;

create or replace function public.complete_staff_invitation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_invitation_id uuid;
  accepted_business uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select si.id, si.business_id
  into pending_invitation_id, accepted_business
  from public.staff_invitations si
  where si.user_id = auth.uid()
    and si.status = 'pending'
  order by si.invited_at desc
  limit 1;

  if pending_invitation_id is null then
    return false;
  end if;

  update public.staff_invitations
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where id = pending_invitation_id;

  update public.users
  set active_business_id = accepted_business,
      is_active = true,
      updated_at = now()
  where id = auth.uid();

  return true;
end;
$$;

revoke execute on function public.complete_staff_invitation() from anon, public;
grant execute on function public.complete_staff_invitation() to authenticated;
