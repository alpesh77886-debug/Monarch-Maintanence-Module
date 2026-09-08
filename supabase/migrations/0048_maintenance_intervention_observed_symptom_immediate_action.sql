-- Loop 54 (Blueprint Gap Matrix G3) — IMPLEMENTATION_PACK.md §9 locks 8
-- separate diagnosis/intervention concepts ("Never collapse all of them
-- into one free-text field"): observed symptom, immediate action /
-- containment, intervention, result, failure mode, validated root cause,
-- permanent corrective action, effectiveness verification.
--
-- Root cause (§9.6) correctly lives in its own maintenance.case_root_causes
-- table (human-validated, separate from AI/RAG recommendation). Permanent
-- corrective action / effectiveness verification (§9.7/§9.8) correctly live
-- in the CAPA flow (maintenance.capa_links, raise_capa/
-- verify_capa_effectiveness) since they are case-level concepts, not
-- per-intervention-event ones. But observed_symptom and immediate_action
-- (§9.1/§9.2) had no column anywhere — a genuine gap against the already-
-- LOCKED pack, found while mapping the Boss's new Architecture Blueprint
-- against this repository (BLUEPRINT_GAP_MATRIX.md, finding G3).
--
-- Purely additive: two new nullable columns, both optional in the RPC
-- (matching the pack's own field-level table, which marks only
-- action_taken/result-equivalent fields as strictly required). No existing
-- row, policy, or transition is touched.

alter table maintenance.interventions
  add column observed_symptom text,
  add column immediate_action text;

comment on column maintenance.interventions.observed_symptom is 'IMPLEMENTATION_PACK.md §9.1 — what was observed, kept distinct from the intervention/action_taken itself.';
comment on column maintenance.interventions.immediate_action is 'IMPLEMENTATION_PACK.md §9.2 — immediate action/containment, kept distinct from the intervention/action_taken itself.';

create or replace function maintenance.record_intervention(
  p_case_id uuid,
  p_action_taken text,
  p_result text default null,
  p_failure_mode text default null,
  p_technician_user_id uuid default null,
  p_observed_symptom text default null,
  p_immediate_action text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_intervention_id uuid;
begin
  if not (
    maintenance.is_staff()
    or exists (
      select 1 from maintenance.case_assignments
      where case_id = p_case_id and technician_user_id = v_actor and is_active
    )
  ) then
    raise exception 'FORBIDDEN: only staff, or an actively assigned technician, may record an intervention';
  end if;
  if not maintenance.is_staff() and p_technician_user_id is not null and p_technician_user_id <> v_actor then
    raise exception 'FORBIDDEN: a non-staff technician may only record their own work';
  end if;
  if p_action_taken is null or length(trim(p_action_taken)) = 0 then
    raise exception 'ACTION_REQUIRED: action_taken is mandatory';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  insert into maintenance.interventions (
    case_id, technician_user_id, action_taken, result, failure_mode, recorded_by,
    observed_symptom, immediate_action
  ) values (
    p_case_id, coalesce(p_technician_user_id, v_actor), p_action_taken, p_result, p_failure_mode,
    case when maintenance.is_staff() then v_actor else null end,
    p_observed_symptom, p_immediate_action
  ) returning id into v_intervention_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (
    p_case_id, 'INTERVENTION_RECORDED', v_actor, p_result,
    jsonb_build_object('intervention_id', v_intervention_id, 'action_taken', p_action_taken)
  );

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'record_intervention', 'maintenance.interventions', v_intervention_id,
          jsonb_build_object('case_id', p_case_id, 'action_taken', p_action_taken));

  return jsonb_build_object('intervention_id', v_intervention_id, 'case_id', p_case_id);
end;
$$;
