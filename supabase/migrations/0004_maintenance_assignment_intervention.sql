-- MONARCH Maintenance — Loop 3: technician assignment + intervention recording
-- (§5.5 assignment, §9 diagnosis/intervention data model, §27 audit).
--
-- Both go through SECURITY DEFINER RPCs so every assignment/intervention is
-- also an auditable case_events/audit_log row, consistent with how Loop 1
-- treats lifecycle transitions. The one exception stays the emergency
-- direct-start path (§5.5: "technician can start directly"), which keeps its
-- plain-insert RLS policy from 0002 — that is deliberately immediate and
-- self-service, not staff-mediated.

-- Staff-mediated assignment must go through assign_technician now.
drop policy if exists case_assignments_insert on maintenance.case_assignments;

create policy case_assignments_insert on maintenance.case_assignments
  for insert to authenticated
  with check (emergency_direct_start and technician_user_id = auth.uid());

create or replace function maintenance.assign_technician(
  p_case_id uuid,
  p_technician_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_current maintenance.case_status;
  v_assignment_id uuid;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may assign a technician';
  end if;

  select status into v_current from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  insert into maintenance.case_assignments (case_id, technician_user_id, assigned_by_user_id)
  values (p_case_id, p_technician_user_id, v_actor)
  returning id into v_assignment_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
  values (
    p_case_id, 'TECHNICIAN_ASSIGNED', v_actor,
    jsonb_build_object('technician_user_id', p_technician_user_id, 'assignment_id', v_assignment_id)
  );

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'assign_technician', 'maintenance.case_assignments', v_assignment_id,
          jsonb_build_object('case_id', p_case_id, 'technician_user_id', p_technician_user_id));

  -- First assignment on an ASSESSED case moves it into ASSIGNED (§4 lifecycle).
  -- Re-assigning technicians later (e.g. during IN_REPAIR) does not move the
  -- case backward — only this specific forward transition is automatic.
  if v_current = 'ASSESSED' then
    perform maintenance.transition_case(p_case_id, 'ASSIGNED');
  end if;

  return jsonb_build_object('assignment_id', v_assignment_id, 'case_id', p_case_id,
                             'technician_user_id', p_technician_user_id);
end;
$$;

-- Staff-mediated intervention recording must go through record_intervention now.
drop policy if exists interventions_insert on maintenance.interventions;

create policy interventions_insert on maintenance.interventions
  for insert to authenticated
  with check (false);

create or replace function maintenance.record_intervention(
  p_case_id uuid,
  p_action_taken text,
  p_result text default null,
  p_failure_mode text default null,
  p_technician_user_id uuid default null
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
  if not (maintenance.is_staff() or p_technician_user_id = v_actor) then
    raise exception 'FORBIDDEN: only staff, or the technician recording their own work, may record an intervention';
  end if;
  if p_action_taken is null or length(trim(p_action_taken)) = 0 then
    raise exception 'ACTION_REQUIRED: action_taken is mandatory';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  insert into maintenance.interventions (
    case_id, technician_user_id, action_taken, result, failure_mode, recorded_by
  ) values (
    p_case_id, coalesce(p_technician_user_id, v_actor), p_action_taken, p_result, p_failure_mode,
    case when maintenance.is_staff() then v_actor else null end
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
