begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select has_table('public', 'staff_invitations', 'staff invitation ledger exists');
select has_column('public', 'staff_invitations', 'status', 'invitation status exists');
select has_column('public', 'staff_invitations', 'last_sent_at', 'resend timestamp exists');
select has_function('public', 'list_staff_management', array[]::text[], 'staff list RPC exists');
select has_function('public', 'change_staff_role', array['uuid', 'text'], 'role change RPC exists');
select has_function('public', 'set_staff_active', array['uuid', 'boolean'], 'staff status RPC exists');
select has_function('public', 'remove_staff_member', array['uuid'], 'staff removal RPC exists');
select has_function('public', 'touch_staff_session', array[]::text[], 'session tracking RPC exists');
select has_column('public', 'activity_logs', 'action', 'staff removal can be audited');
select function_privs_are(
  'public',
  'remove_staff_member',
  array['uuid'],
  'authenticated',
  array['EXECUTE'],
  'only authenticated users can call staff removal'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.staff_invitations'::regclass),
  true,
  'staff invitations use RLS'
);

select * from finish();
rollback;
