-- MONARCH Maintenance — Loop 14: production impact capture for KPIs (§25).
--
-- §25.1 group 3 is "Production Impact — minutes + kg" and §25.2 lists
-- "downtime minutes" and "output loss kg" as minimum operational measures.
-- Neither had anywhere to live: no column, no table. Everything else §25.2
-- asks for is already derivable from existing history (case age from
-- created_at, restoration time from technically_restored_at, wait duration
-- from waits, PM overdue from pm_instances, ownership/workload from
-- case_ownership, reopen signals from case_events, escalation state from the
-- emergency/wait columns) — these two were the real gap.
--
-- Two locked rules shape the design:
--   §25.2 "Missing data must NOT silently become zero" — so the numbers are
--   nullable and stay NULL when unknown. There is no DEFAULT 0 anywhere in
--   this file, and the reporting layer must render NULL as "not recorded".
--   §25.2 "Financial impact must use an authoritative source/basis" — so
--   every impact record must state the basis it came from.
--
-- Append-only per §27: a revised figure is a NEW row pointing at the one it
-- supersedes, never an UPDATE of the original.

create table maintenance.case_impact_records (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  -- Both nullable on purpose: recording only downtime, or only output loss,
  -- is a valid partial observation. NULL means "not recorded", never zero.
  downtime_minutes numeric check (downtime_minutes is null or downtime_minutes >= 0),
  output_loss_kg numeric check (output_loss_kg is null or output_loss_kg >= 0),
  -- Where the numbers came from (line log, production report, supervisor
  -- statement...). A figure with no stated basis is not usable as a KPI.
  basis text not null,
  recorded_by uuid not null references maintenance.staff(id),
  recorded_at timestamptz not null default now(),
  supersedes_record_id uuid references maintenance.case_impact_records(id)
);

create index on maintenance.case_impact_records (case_id);

alter table maintenance.case_impact_records enable row level security;

create policy case_impact_records_select on maintenance.case_impact_records
  for select to authenticated using (maintenance.is_staff());

create policy case_impact_records_insert on maintenance.case_impact_records
  for insert to authenticated with check (false); -- RPC-only

create or replace function maintenance.record_production_impact(
  p_case_id uuid,
  p_basis text,
  p_downtime_minutes numeric default null,
  p_output_loss_kg numeric default null,
  p_supersedes_record_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_record_id uuid;
begin
  -- coalesce even though is_staff() is `... is not null` and cannot return
  -- NULL today: RISK-13 was exactly this pattern going wrong when the helper
  -- underneath changed shape. The guard should not depend on that.
  if not coalesce(maintenance.is_staff(), false) then
    raise exception 'FORBIDDEN: only Maintenance staff may record production impact';
  end if;
  if p_basis is null or length(trim(p_basis)) = 0 then
    raise exception 'BASIS_REQUIRED: an impact figure must state where it came from (25.2)';
  end if;
  -- A record with neither number says nothing; it would only add noise to
  -- the KPI history.
  if p_downtime_minutes is null and p_output_loss_kg is null then
    raise exception 'NO_MEASURE_SUPPLIED: record downtime minutes, output loss kg, or both';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if p_supersedes_record_id is not null
     and not exists (
       select 1 from maintenance.case_impact_records
       where id = p_supersedes_record_id and case_id = p_case_id
     ) then
    raise exception 'INVALID_SUPERSEDE: % is not an impact record on this case', p_supersedes_record_id;
  end if;

  insert into maintenance.case_impact_records (
    case_id, downtime_minutes, output_loss_kg, basis, recorded_by, supersedes_record_id
  ) values (
    p_case_id, p_downtime_minutes, p_output_loss_kg, p_basis, v_actor, p_supersedes_record_id
  ) returning id into v_record_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'PRODUCTION_IMPACT_RECORDED', v_actor, p_basis,
          jsonb_build_object('impact_record_id', v_record_id,
                             'downtime_minutes', p_downtime_minutes,
                             'output_loss_kg', p_output_loss_kg,
                             'supersedes_record_id', p_supersedes_record_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'record_production_impact', 'maintenance.case_impact_records', v_record_id,
          jsonb_build_object('case_id', p_case_id,
                             'downtime_minutes', p_downtime_minutes,
                             'output_loss_kg', p_output_loss_kg), p_basis);

  return jsonb_build_object(
    'impact_record_id', v_record_id,
    'case_id', p_case_id,
    'downtime_minutes', p_downtime_minutes,
    'output_loss_kg', p_output_loss_kg
  );
end;
$$;

-- Current impact per case: the newest record that nothing else supersedes.
-- A view rather than a column on `cases`, so the history stays append-only
-- and a correction never overwrites what was originally reported.
create or replace view maintenance.case_current_impact as
select distinct on (r.case_id)
  r.case_id,
  r.id as impact_record_id,
  r.downtime_minutes,
  r.output_loss_kg,
  r.basis,
  r.recorded_by,
  r.recorded_at
from maintenance.case_impact_records r
where not exists (
  select 1 from maintenance.case_impact_records newer
  where newer.supersedes_record_id = r.id
)
order by r.case_id, r.recorded_at desc;
