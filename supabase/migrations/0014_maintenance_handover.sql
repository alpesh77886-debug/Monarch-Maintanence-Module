-- MONARCH Maintenance — Loop 12: shift handover / availability (§22).
--
-- A note on `UNASSIGNED / WAITING_MAINTENANCE` (§22.1, §24): this is NOT
-- added as a case_status value. The §4 lifecycle graph is LOCKED and has no
-- such node, and ownership is a separate axis from lifecycle status in this
-- schema already (§5.6 ownership transfer, and WAITING is likewise an
-- overlay rather than a status). So "unassigned / waiting maintenance" is
-- represented the way the schema already represents it: the case keeps its
-- lifecycle status and its `current_owner_user_id` goes NULL, which is
-- exactly the state `take_ownership` is written to pick back up. Adding a
-- status would have been a lifecycle change requiring a §42 Change Control
-- entry; this needs none.

-- ---------------------------------------------------------------------------
-- Availability (§22 "next available Executive"). The pack says "available /
-- logged-in" but a logged-in session is not something the database can see,
-- and inferring availability from session activity would be guesswork. So
-- availability is explicit and self-declared — on shift / off shift.
-- ---------------------------------------------------------------------------

alter table maintenance.staff
  add column if not exists is_available boolean not null default true,
  add column if not exists availability_changed_at timestamptz;

-- §23 locks "required ownership/handover notifications" as a minimum.
alter table maintenance.notifications
  drop constraint if exists notifications_notification_type_check;

alter table maintenance.notifications
  add constraint notifications_notification_type_check check (notification_type in (
    'CASE_ACKNOWLEDGED',
    'WAIT_RESUME_READY',
    'WAIT_ESCALATION_24H',
    'WAIT_MANAGER_REMINDER_24H',
    'EMERGENCY_ESCALATION_1H',
    'PM_OVERDUE',
    'CASE_HANDOVER_RECEIVED',
    'CASE_UNASSIGNED'
  ));

create or replace function maintenance.set_availability(p_is_available boolean)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff have an availability state';
  end if;

  -- Self only. A Manager wanting to mark someone else off-shift is a
  -- different authority question the pack does not settle, so it is not
  -- invented here.
  update maintenance.staff
  set is_available = p_is_available, availability_changed_at = now(), updated_at = now()
  where id = v_actor;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'set_availability', 'maintenance.staff', v_actor,
          jsonb_build_object('is_available', p_is_available));

  return jsonb_build_object('is_available', p_is_available);
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual handover — the preferred path (§22.1 "Manual handover is
-- preferred"). Ownership history is preserved by closing the current
-- case_ownership row and opening a new one; `cases.created_at` is never
-- touched, so case age does not reset (§22.1, §5.6).
-- ---------------------------------------------------------------------------

create or replace function maintenance.handover_case(
  p_case_id uuid,
  p_to_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_owner uuid;
  v_case_number text;
  v_receiver_name text;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may hand over a case';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: a handover reason is mandatory';
  end if;

  select current_owner_user_id, case_number into v_current_owner, v_case_number
  from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  -- The current owner hands over their own case; a Manager may also move it
  -- (§3.2: Manager is the override authority).
  if v_current_owner is distinct from v_actor and not maintenance.is_manager() then
    raise exception 'FORBIDDEN: only the current owner or a Manager may hand this case over';
  end if;
  if p_to_user_id = v_current_owner then
    raise exception 'INVALID_RECEIVER: the case is already owned by that person';
  end if;

  select full_name into v_receiver_name
  from maintenance.staff where id = p_to_user_id and is_active;
  if v_receiver_name is null then
    raise exception 'INVALID_RECEIVER: % is not an active Maintenance staff member', p_to_user_id;
  end if;

  update maintenance.case_ownership
  set ended_at = now(), transfer_reason = p_reason
  where case_id = p_case_id and ended_at is null;

  insert into maintenance.case_ownership (case_id, owner_user_id, assigned_by_user_id, transfer_reason)
  values (p_case_id, p_to_user_id, v_actor, p_reason);

  update maintenance.cases
  set current_owner_user_id = p_to_user_id, updated_at = now()
  where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'OWNERSHIP_HANDOVER', v_actor, p_reason,
          jsonb_build_object('from_user_id', v_current_owner, 'to_user_id', p_to_user_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, before, after, reason)
  values (v_actor, 'handover_case', 'maintenance.cases', p_case_id,
          jsonb_build_object('owner_user_id', v_current_owner),
          jsonb_build_object('owner_user_id', p_to_user_id), p_reason);

  insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
  values (p_to_user_id, p_case_id, 'CASE_HANDOVER_RECEIVED',
          format('Case %s has been handed over to you.', v_case_number));

  return jsonb_build_object('case_id', p_case_id, 'from_user_id', v_current_owner, 'to_user_id', p_to_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Logout path (§22.1). The UI warns first; this is what runs on confirm.
-- Auto-handover goes to the next available Executive, falling back to an
-- available Manager ("If no Executive/Manager is available" implies a
-- Manager may receive). With nobody available the case is unassigned rather
-- than left with someone who has gone home.
--
-- Receiver choice among several available people is deterministic (Executives
-- first, then whoever has been available longest, then name) — the pack says
-- "next available", not how to rank, so this is a mechanism choice and
-- deliberately not a workload/round-robin policy, which would be invented.
-- ---------------------------------------------------------------------------

create or replace function maintenance.handover_all_open_cases(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_receiver uuid;
  v_case record;
  v_manager record;
  v_handed int := 0;
  v_unassigned int := 0;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff hold case ownership';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: a handover reason is mandatory';
  end if;

  select id into v_receiver
  from maintenance.staff
  where is_active and is_available and id <> v_actor
  order by
    case when role = 'MAINTENANCE_EXECUTIVE' then 0 else 1 end,
    availability_changed_at nulls first,
    full_name
  limit 1;

  for v_case in
    select id, case_number from maintenance.cases
    where current_owner_user_id = v_actor
      and status not in ('CLOSED', 'REJECTED', 'DUPLICATE')
  loop
    update maintenance.case_ownership
    set ended_at = now(), transfer_reason = p_reason
    where case_id = v_case.id and ended_at is null;

    if v_receiver is not null then
      insert into maintenance.case_ownership (case_id, owner_user_id, assigned_by_user_id, transfer_reason)
      values (v_case.id, v_receiver, v_actor, p_reason);

      update maintenance.cases
      set current_owner_user_id = v_receiver, updated_at = now()
      where id = v_case.id;

      insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
      values (v_case.id, 'OWNERSHIP_HANDOVER', v_actor, p_reason,
              jsonb_build_object('from_user_id', v_actor, 'to_user_id', v_receiver, 'trigger', 'LOGOUT'));

      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_receiver, v_case.id, 'CASE_HANDOVER_RECEIVED',
              format('Case %s was handed over to you at shift end.', v_case.case_number));

      v_handed := v_handed + 1;
    else
      -- §22.1: nobody available -> UNASSIGNED / WAITING_MAINTENANCE, which
      -- in this schema is owner NULL (see the note at the top of this file).
      update maintenance.cases
      set current_owner_user_id = null, updated_at = now()
      where id = v_case.id;

      insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
      values (v_case.id, 'OWNERSHIP_UNASSIGNED', v_actor, p_reason,
              jsonb_build_object('from_user_id', v_actor, 'trigger', 'LOGOUT_NO_RECEIVER'));

      -- An orphaned case that nobody is told about is the failure mode §22.1
      -- exists to prevent, so Managers are notified.
      for v_manager in select id from maintenance.staff where role = 'MAINTENANCE_MANAGER' and is_active loop
        insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
        values (v_manager.id, v_case.id, 'CASE_UNASSIGNED',
                format('Case %s is unassigned — no Executive was available at shift end.', v_case.case_number));
      end loop;

      v_unassigned := v_unassigned + 1;
    end if;
  end loop;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'handover_all_open_cases', 'maintenance.cases', v_actor,
          jsonb_build_object('handed_over', v_handed, 'unassigned', v_unassigned, 'receiver_user_id', v_receiver),
          p_reason);

  return jsonb_build_object(
    'handed_over', v_handed,
    'unassigned', v_unassigned,
    'receiver_user_id', v_receiver
  );
end;
$$;
