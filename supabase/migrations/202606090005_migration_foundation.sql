create table public.migration_staging (
  id bigint generated always as identity primary key,
  migration_run_id uuid not null references public.migration_runs(id) on delete cascade,
  entity_type text not null,
  source_id text not null,
  payload jsonb not null,
  source_checksum text not null,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (migration_run_id, entity_type, source_id)
);

alter table public.migration_staging enable row level security;
grant select, insert, update, delete on public.migration_staging to authenticated;
grant usage, select on sequence public.migration_staging_id_seq to authenticated;

create policy migration_staging_select
on public.migration_staging for select to authenticated
using (
  exists (
    select 1
    from public.migration_runs mr
    where mr.id = migration_run_id
      and public.has_permission('migrations.manage', mr.business_id)
  )
);

create policy migration_staging_write
on public.migration_staging for all to authenticated
using (
  exists (
    select 1
    from public.migration_runs mr
    where mr.id = migration_run_id
      and public.has_permission('migrations.manage', mr.business_id)
  )
)
with check (
  exists (
    select 1
    from public.migration_runs mr
    where mr.id = migration_run_id
      and public.has_permission('migrations.manage', mr.business_id)
  )
);

create or replace function public.begin_local_storage_migration(
  source_file_name text,
  source_file_sha256 text,
  source_origin text,
  source_version text,
  expected_counts jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_business uuid;
  existing_run_id uuid;
  new_run_id uuid;
begin
  active_business := public.current_business_id();

  if not public.has_permission('migrations.manage', active_business) then
    raise exception 'Migration permission required';
  end if;

  select id
  into existing_run_id
  from public.migration_runs
  where file_sha256 = source_file_sha256;

  if existing_run_id is not null then
    return existing_run_id;
  end if;

  insert into public.migration_runs (
    business_id,
    source_name,
    source_version,
    source_origin,
    file_name,
    file_sha256,
    status,
    expected_counts,
    started_by,
    started_at
  )
  values (
    active_business,
    'Tastory OMS LocalStorage',
    source_version,
    source_origin,
    source_file_name,
    source_file_sha256,
    'running',
    coalesce(expected_counts, '{}'::jsonb),
    auth.uid(),
    now()
  )
  returning id into new_run_id;

  return new_run_id;
end;
$$;

create or replace function public.complete_migration_run(
  requested_run_id uuid,
  requested_imported_counts jsonb,
  requested_validation_results jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_business_id uuid;
begin
  select business_id
  into run_business_id
  from public.migration_runs
  where id = requested_run_id
  for update;

  if run_business_id is null
     or not public.has_permission('migrations.manage', run_business_id) then
    raise exception 'Migration run not found or permission denied';
  end if;

  update public.migration_runs
  set status = 'completed',
      imported_counts = coalesce(requested_imported_counts, '{}'::jsonb),
      validation_results = coalesce(requested_validation_results, '{}'::jsonb),
      completed_at = now(),
      error_message = null
  where id = requested_run_id;
end;
$$;

create or replace function public.fail_migration_run(
  requested_run_id uuid,
  failure_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_business_id uuid;
begin
  select business_id
  into run_business_id
  from public.migration_runs
  where id = requested_run_id
  for update;

  if run_business_id is null
     or not public.has_permission('migrations.manage', run_business_id) then
    raise exception 'Migration run not found or permission denied';
  end if;

  update public.migration_runs
  set status = 'failed',
      completed_at = now(),
      error_message = failure_message
  where id = requested_run_id;
end;
$$;

revoke execute on function public.begin_local_storage_migration(text, text, text, text, jsonb)
  from anon, public;
revoke execute on function public.complete_migration_run(uuid, jsonb, jsonb)
  from anon, public;
revoke execute on function public.fail_migration_run(uuid, text)
  from anon, public;

grant execute on function public.begin_local_storage_migration(text, text, text, text, jsonb)
  to authenticated;
grant execute on function public.complete_migration_run(uuid, jsonb, jsonb)
  to authenticated;
grant execute on function public.fail_migration_run(uuid, text)
  to authenticated;

create or replace view public.migration_validation_summary
with (security_invoker = true)
as
select
  mr.id as migration_run_id,
  mr.business_id,
  mr.file_name,
  mr.file_sha256,
  mr.status,
  mr.expected_counts,
  mr.imported_counts,
  mr.validation_results,
  count(ms.id) as staged_records,
  count(ms.id) filter (where ms.processed_at is not null and ms.error_message is null) as processed_records,
  count(ms.id) filter (where ms.error_message is not null) as failed_records,
  mr.started_at,
  mr.completed_at
from public.migration_runs mr
left join public.migration_staging ms on ms.migration_run_id = mr.id
group by mr.id;

grant select on public.migration_validation_summary to authenticated;
