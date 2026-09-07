-- Loop 30 (RISK-22): record_intervention's actor-eligibility check (Loop 3,
-- migration 0004) was `is_staff() OR p_technician_user_id = v_actor` — it
-- never verified the caller actually held an active case_assignments row
-- for the case, unlike every later actor-eligibility RPC in this schema
-- (record_spare_usage, migration 0009, explicitly checks case_assignments
-- and its own comment describes record_intervention's intent as "staff, or
-- the actively assigned technician on this case" -- a documented intent
-- the original 0004 code never actually implemented).
--
-- Two compounding problems, live-verified:
--   1. No assignment check at all: any signed-in non-staff user could pass
--      p_technician_user_id = their own id and record a fabricated
--      intervention on ANY case in the system, whether or not they were
--      ever assigned to it.
--   2. A NULL-propagation bug on top: p_technician_user_id defaults to
--      NULL, and `NULL = v_actor` evaluates to NULL (not false) in SQL.
--      `not (false or NULL)` is NULL, and PL/pgSQL's `if NULL then` does
--      not raise -- so simply omitting the parameter also silently passed
--      the check, for any caller, on any case.
--
-- This app's own UI already gates the intervention form correctly behind
-- isAssignedTechnician/isStaffRow (page.tsx) -- this was a pure
-- server-side enforcement gap, exactly what §29 warns against ("the UI is
-- not a security boundary"). No UI change needed.
--
-- Fix: require an active case_assignments row (matching
-- record_spare_usage's established pattern) instead of trusting a
-- client-supplied id comparison that can evaluate to NULL. A non-staff
-- caller who is genuinely assigned still cannot claim to be a *different*
-- technician than themselves.

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
