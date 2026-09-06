-- MONARCH Maintenance — Loop 17: validated root cause (§9, §9.1).
--
-- §9 splits diagnosis/intervention into 8 distinct concepts and says "Never
-- collapse all of them into one free-text field": symptom, immediate
-- action, intervention, result, failure mode, VALIDATED ROOT CAUSE,
-- permanent corrective action, effectiveness verification.
--
-- Checking the live schema against that list: symptom (cases.symptom),
-- immediate action/intervention/result/failure mode (interventions table),
-- permanent corrective action (capa_links.corrective_action, Loop 15),
-- effectiveness verification (capa_links.status, Loop 15) all exist. Item 6
-- — validated root cause — does not: the only place root cause could be
-- recorded anywhere in this schema is `record_recurrence_root_cause`, which
-- is gated behind a CONFIRMED recurrence flag. Recurrence detection is
-- currently inert by design (PENDING-04, Loop 15) and even once configured
-- will only ever cover cases matching a rule — the great majority of
-- one-off breakdowns have NO seam anywhere to record a validated root cause
-- at all. That is the real gap this migration closes.
--
-- §9.1 is explicit: "The system/AI MUST NOT infer or declare authoritative
-- root cause from symptom text alone... Only an authorized human process can
-- validate and record root cause as authoritative." So the RPC below is
-- staff-only, requires a stated basis (mirroring the §25.2 impact-record
-- pattern — a root cause with no stated validation basis is a guess, not a
-- finding), and has no automated caller anywhere in this schema.
--
-- Append-only per §27 and §8 ("Corrections are additive, not destructive.
-- Do not compress away earlier observations/actions."): a revised root cause
-- is a new row pointing at the one it supersedes, mirroring
-- case_impact_records (Loop 14).
--
-- The reporting view sets security_invoker = true FROM CREATION. RISK-15
-- (Loop 14) found that a view without it silently reads past RLS because it
-- runs as its owner rather than the caller — that mistake is not repeated
-- here.

create table maintenance.case_root_causes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  root_cause text not null,
  -- How this was validated — e.g. "component sectioned and inspected",
  -- "vendor failure analysis report". A root cause with no stated basis is
  -- exactly the "declared from symptom text alone" pattern §9.1 forbids.
  basis text not null,
  recorded_by uuid not null references maintenance.staff(id),
  recorded_at timestamptz not null default now(),
  supersedes_record_id uuid references maintenance.case_root_causes(id)
);

create index on maintenance.case_root_causes (case_id);

alter table maintenance.case_root_causes enable row level security;

create policy case_root_causes_select on maintenance.case_root_causes
  for select to authenticated using (maintenance.is_staff());

create policy case_root_causes_insert on maintenance.case_root_causes
  for insert to authenticated with check (false); -- RPC-only

create or replace function maintenance.record_root_cause(
  p_case_id uuid,
  p_root_cause text,
  p_basis text,
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
  if not coalesce(maintenance.is_staff(), false) then
    raise exception 'FORBIDDEN: only Maintenance staff may record a validated root cause';
  end if;
  if p_root_cause is null or length(trim(p_root_cause)) = 0 then
    raise exception 'ROOT_CAUSE_REQUIRED';
  end if;
  if p_basis is null or length(trim(p_basis)) = 0 then
    raise exception 'BASIS_REQUIRED: state how this root cause was validated (§9.1 — not inferred from symptom text alone)';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if p_supersedes_record_id is not null
     and not exists (
       select 1 from maintenance.case_root_causes
       where id = p_supersedes_record_id and case_id = p_case_id
     ) then
    raise exception 'INVALID_SUPERSEDE: % is not a root-cause record on this case', p_supersedes_record_id;
  end if;

  insert into maintenance.case_root_causes (
    case_id, root_cause, basis, recorded_by, supersedes_record_id
  ) values (
    p_case_id, p_root_cause, p_basis, v_actor, p_supersedes_record_id
  ) returning id into v_record_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'ROOT_CAUSE_RECORDED', v_actor, p_basis,
          jsonb_build_object('root_cause_record_id', v_record_id,
                             'root_cause', p_root_cause,
                             'supersedes_record_id', p_supersedes_record_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'record_root_cause', 'maintenance.case_root_causes', v_record_id,
          jsonb_build_object('case_id', p_case_id, 'root_cause', p_root_cause), p_basis);

  return jsonb_build_object('root_cause_record_id', v_record_id, 'case_id', p_case_id,
                             'root_cause', p_root_cause);
end;
$$;

-- Current validated root cause per case: the newest record that nothing else
-- supersedes. Same shape as case_current_impact (Loop 14) for the same
-- reason — the history stays append-only and a correction never overwrites
-- what was originally recorded.
create view maintenance.case_current_root_cause
with (security_invoker = true)
as
select distinct on (r.case_id)
  r.case_id,
  r.id as root_cause_record_id,
  r.root_cause,
  r.basis,
  r.recorded_by,
  r.recorded_at
from maintenance.case_root_causes r
where not exists (
  select 1 from maintenance.case_root_causes newer
  where newer.supersedes_record_id = r.id
)
order by r.case_id, r.recorded_at desc;
