-- Loop 35: §15 says "Immediate Production Manager notification is mandatory"
-- for a safety/technical stop -- but raise_safety_stop (migration 0015) never
-- sent any notification at all. Live-verified: 271 real stops raised in this
-- project's history, zero notifications of any type tied to any of them, and
-- 'SAFETY_STOP_RAISED' was never even a member of notifications_notification_
-- type_check.
--
-- This module has no Production Manager account to notify -- Production is a
-- separate module with its own (not-yet-built) auth, and CLAUDE.md forbids
-- Maintenance inventing cross-module authority. Migration 0015 already faced
-- this exact problem for the closely related §13.1 requirement
-- (record_production_started_without_release) and resolved it by notifying
-- every active MAINTENANCE_MANAGER instead, reasoning "Managers are the
-- escalation authority (§3.2)". This applies that same established
-- substitute-recipient pattern to raise_safety_stop, which should have had it
-- from the start.

alter table maintenance.notifications
  drop constraint if exists notifications_notification_type_check;

alter table maintenance.notifications
  add constraint notifications_notification_type_check check (notification_type in (
    -- Full existing set, read back live per the 0018 lesson (an earlier
    -- draft there lost two values by copying an out-of-date list).
    'CASE_ACKNOWLEDGED',
    'WAIT_RESUME_READY',
    'WAIT_ESCALATION_24H',
    'WAIT_MANAGER_REMINDER_24H',
    'EMERGENCY_ESCALATION_1H',
    'PM_OVERDUE',
    'CASE_HANDOVER_RECEIVED',
    'CASE_UNASSIGNED',
    'PRODUCTION_BOUNDARY_BREACH',
    'RECURRENCE_SUSPECTED',
    'CAPA_ASSIGNED',
    'SAFETY_STOP_RAISED'
  ));

create or replace function maintenance.raise_safety_stop(
  p_case_id uuid,
  p_stop_type text,
  p_reason text,
  p_machine_ref text default null,
  p_line_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_stop_id uuid;
  v_case_number text;
  v_manager record;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may raise a safety/technical stop';
  end if;
  if p_stop_type not in ('SAFETY', 'TECHNICAL') then
    raise exception 'INVALID_STOP_TYPE: stop_type must be SAFETY or TECHNICAL, got %', p_stop_type;
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: a stop reason is mandatory';
  end if;
  select case_number into v_case_number from maintenance.cases where id = p_case_id;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if exists (select 1 from maintenance.safety_stops where case_id = p_case_id and lifted_at is null) then
    raise exception 'STOP_ALREADY_ACTIVE: this case already has an active stop';
  end if;

  insert into maintenance.safety_stops (
    case_id, stop_type, machine_ref, line_ref, reason, raised_by
  ) values (
    p_case_id, p_stop_type, p_machine_ref, p_line_ref, p_reason, v_actor
  ) returning id into v_stop_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'SAFETY_STOP_RAISED', v_actor, p_reason,
          jsonb_build_object('safety_stop_id', v_stop_id, 'stop_type', p_stop_type,
                             'machine_ref', p_machine_ref, 'line_ref', p_line_ref));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'raise_safety_stop', 'maintenance.safety_stops', v_stop_id,
          jsonb_build_object('case_id', p_case_id, 'stop_type', p_stop_type), p_reason);

  -- §15: "Immediate Production Manager notification is mandatory." No
  -- Production Manager account exists in this module (§3.1's two Maintenance
  -- roles are the only ones), so per the 0015 precedent, notify every active
  -- Maintenance Manager instead -- they are this module's escalation
  -- authority for exactly this kind of event (§3.2).
  for v_manager in select id from maintenance.staff where role = 'MAINTENANCE_MANAGER' and is_active loop
    insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
    values (v_manager.id, p_case_id, 'SAFETY_STOP_RAISED',
            format('%s stop raised on case %s: %s', p_stop_type, v_case_number, p_reason));
  end loop;

  return jsonb_build_object('safety_stop_id', v_stop_id, 'case_id', p_case_id, 'stop_type', p_stop_type);
end;
$$;
