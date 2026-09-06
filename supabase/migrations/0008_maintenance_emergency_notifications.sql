-- MONARCH Maintenance — Loop 7: Emergency two-step confirmation (§6),
-- notifications (§23), and timer-based escalation (§7.2, §7.3).
--
-- §6 requires the emergency workflow to be TWO-STEP (reporter claim, then
-- Executive/Manager confirmation) with the 1h clock starting only at
-- confirmation. `cases.emergency_claimed`/`emergency_confirmed` existed since
-- Loop 1 but no RPC ever set them — this migration adds the actor/timestamp/
-- reason columns §6 requires to be recorded, plus the two RPCs, plus the
-- notifications table and a pg_cron-scheduled scan for the 24h/1h timers.

-- ---------------------------------------------------------------------------
-- Columns §6 requires to be recorded that Loop 1 missed (claim actor,
-- timestamp, reason/evidence) and a column to make the 1h escalation
-- idempotent (fire once, per §23 "delivery must be idempotent").
-- ---------------------------------------------------------------------------

alter table maintenance.cases
  add column if not exists emergency_claimed_by uuid references auth.users(id),
  add column if not exists emergency_claimed_at timestamptz,
  add column if not exists emergency_claim_reason text,
  add column if not exists emergency_escalated_at timestamptz;

-- ---------------------------------------------------------------------------
-- Notifications (§23). RPC/definer-only writes, same pattern as every other
-- mutation-sensitive table in this schema (see 0002/0006) — a client can
-- read its own notifications and nothing else.
-- ---------------------------------------------------------------------------

create table maintenance.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id),
  case_id uuid references maintenance.cases(id),
  notification_type text not null check (notification_type in (
    'CASE_ACKNOWLEDGED',
    'WAIT_RESUME_READY',
    'WAIT_ESCALATION_24H',
    'WAIT_MANAGER_REMINDER_24H',
    'EMERGENCY_ESCALATION_1H'
  )),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_recipient_unread_idx
  on maintenance.notifications (recipient_user_id)
  where read_at is null;

alter table maintenance.notifications enable row level security;

create policy notifications_select on maintenance.notifications
  for select to authenticated
  using (recipient_user_id = auth.uid());

create policy notifications_insert on maintenance.notifications
  for insert to authenticated
  with check (false); -- all writes go through SECURITY DEFINER functions below

create policy notifications_update on maintenance.notifications
  for update to authenticated
  using (false); -- mark_notification_read below is the only way to set read_at

create or replace function maintenance.mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_updated int;
begin
  update maintenance.notifications
  set read_at = now()
  where id = p_notification_id and recipient_user_id = v_actor and read_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'NOTIFICATION_NOT_FOUND_OR_NOT_YOURS: %', p_notification_id;
  end if;

  return jsonb_build_object('notification_id', p_notification_id, 'read', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Emergency two-step workflow (§6).
-- Step 1: reporter (or staff, who may spot the emergency themselves) claims.
-- Step 2: Executive/Manager confirms — only this starts the 1h clock (§7.3).
-- A generic UI toggle cannot bypass this: both steps are separate RPCs with
-- their own authorization and ordering checks, not a single settable flag.
-- ---------------------------------------------------------------------------

create or replace function maintenance.claim_emergency(
  p_case_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reporter uuid;
  v_confirmed boolean;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: an emergency claim requires a reason/evidence';
  end if;

  select reporter_user_id, emergency_confirmed into v_reporter, v_confirmed
  from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if coalesce(v_confirmed, false) then
    raise exception 'ALREADY_CONFIRMED: emergency already confirmed for case %', p_case_id;
  end if;
  if v_actor <> v_reporter and not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only the reporter or Maintenance staff may claim Emergency/Safety-Critical';
  end if;

  update maintenance.cases set
    emergency_claimed = true,
    emergency_claimed_by = v_actor,
    emergency_claimed_at = now(),
    emergency_claim_reason = p_reason,
    updated_at = now()
  where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'EMERGENCY_CLAIMED', v_actor, p_reason, jsonb_build_object('claimed_by', v_actor));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'claim_emergency', 'maintenance.cases', p_case_id,
          jsonb_build_object('emergency_claimed', true), p_reason);

  return jsonb_build_object('case_id', p_case_id, 'emergency_claimed', true);
end;
$$;

create or replace function maintenance.confirm_emergency(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_claimed boolean;
  v_confirmed boolean;
  v_confirmed_at timestamptz := now();
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance Executive or Manager may confirm Emergency/Safety-Critical';
  end if;

  select emergency_claimed, emergency_confirmed into v_claimed, v_confirmed
  from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if not coalesce(v_claimed, false) then
    raise exception 'NOT_CLAIMED: emergency must be claimed before it can be confirmed';
  end if;
  if coalesce(v_confirmed, false) then
    raise exception 'ALREADY_CONFIRMED: emergency already confirmed for case %', p_case_id;
  end if;

  update maintenance.cases set
    emergency_confirmed = true,
    emergency_confirmed_by = v_actor,
    emergency_confirmed_at = v_confirmed_at,
    updated_at = now()
  where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
  values (p_case_id, 'EMERGENCY_CONFIRMED', v_actor, jsonb_build_object('confirmed_by', v_actor));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'confirm_emergency', 'maintenance.cases', p_case_id, jsonb_build_object('emergency_confirmed', true));

  return jsonb_build_object('case_id', p_case_id, 'emergency_confirmed', true, 'emergency_confirmed_at', v_confirmed_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Wire the two purely event-driven notifications (§23) into the RPCs where
-- those events already happen — acknowledgement (§5.2 "reporter notification
-- text should clearly state who acknowledged the case") and external-wait
-- resume-ready (§7.2 "immediate notification to assigned Executive").
-- ---------------------------------------------------------------------------

create or replace function maintenance.acknowledge_case(
  p_case_id uuid,
  p_priority maintenance.priority,
  p_initial_assessment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_current maintenance.case_status;
  v_reporter uuid;
  v_case_number text;
  v_actor_name text;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may acknowledge a case';
  end if;

  select status, reporter_user_id, case_number into v_current, v_reporter, v_case_number
  from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if v_current not in ('REPORTED', 'NEEDS_INFORMATION') then
    raise exception 'INVALID_TRANSITION: cannot acknowledge a case in status %', v_current;
  end if;

  if (select current_owner_user_id from maintenance.cases where id = p_case_id) is null then
    perform maintenance.take_ownership(p_case_id);
  end if;

  update maintenance.cases set
    status = 'ACKNOWLEDGED',
    priority = p_priority,
    acknowledged_by_user_id = v_actor,
    acknowledged_at = now(),
    updated_at = now()
  where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, previous_status, new_status, reason)
  values (p_case_id, 'ACKNOWLEDGED', v_actor, v_current, 'ACKNOWLEDGED', p_initial_assessment);

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'acknowledge_case', 'maintenance.cases', p_case_id,
          jsonb_build_object('status', 'ACKNOWLEDGED', 'priority', p_priority), p_initial_assessment);

  if v_reporter is not null then
    select full_name into v_actor_name from maintenance.staff where id = v_actor;
    insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
    values (v_reporter, p_case_id, 'CASE_ACKNOWLEDGED',
            format('Case %s has been acknowledged by %s.', v_case_number, coalesce(v_actor_name, 'a Maintenance Executive')));
  end if;

  return jsonb_build_object('case_id', p_case_id, 'status', 'ACKNOWLEDGED', 'owner_user_id', v_actor);
end;
$$;

create or replace function maintenance.mark_wait_resolved(p_wait_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_reason_type text;
  v_owner uuid;
  v_case_number text;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may mark a dependency resolved';
  end if;

  select case_id, reason_type into v_case_id, v_reason_type
  from maintenance.waits where id = p_wait_id and resumed_at is null
  for update;
  if not found then
    raise exception 'WAIT_NOT_FOUND_OR_ALREADY_RESUMED: %', p_wait_id;
  end if;
  if v_reason_type <> 'EXTERNAL' then
    raise exception 'INVALID_OPERATION: mark_wait_resolved only applies to EXTERNAL waits; INTERNAL waits resume directly via resume_wait';
  end if;

  update maintenance.waits set resume_ready_at = now() where id = p_wait_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
  values (v_case_id, 'WAIT_RESUME_READY', v_actor, jsonb_build_object('wait_id', p_wait_id));

  select current_owner_user_id, case_number into v_owner, v_case_number
  from maintenance.cases where id = v_case_id;

  if v_owner is not null then
    insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
    values (v_owner, v_case_id, 'WAIT_RESUME_READY',
            format('Case %s external dependency resolved — ready to resume.', v_case_number));
  end if;

  return jsonb_build_object('wait_id', p_wait_id, 'case_id', v_case_id, 'resume_ready', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Timer-based escalation scan (§7.2 24h resume-ready + 24h repeat reminder;
-- §7.3 1h confirmed-emergency). Administrative function: only pg_cron (as
-- the postgres role) runs it, never a client — revoked below.
-- ---------------------------------------------------------------------------

create or replace function maintenance.run_escalation_scan()
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_wait record;
  v_case record;
  v_manager record;
  v_count_24h int := 0;
  v_count_reminder int := 0;
  v_count_emergency int := 0;
begin
  -- §7.2: resume-ready with no required action for 24h -> alert Exec + Manager, once.
  for v_wait in
    select w.id as wait_id, w.case_id, c.case_number, c.current_owner_user_id
    from maintenance.waits w
    join maintenance.cases c on c.id = w.case_id
    where w.resume_ready_at is not null
      and w.resumed_at is null
      and w.last_escalated_at is null
      and w.resume_ready_at <= now() - interval '24 hours'
  loop
    if v_wait.current_owner_user_id is not null then
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_wait.current_owner_user_id, v_wait.case_id, 'WAIT_ESCALATION_24H',
              format('Case %s has been resume-ready for 24h with no action.', v_wait.case_number));
    end if;
    for v_manager in select id from maintenance.staff where role = 'MAINTENANCE_MANAGER' and is_active loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_manager.id, v_wait.case_id, 'WAIT_ESCALATION_24H',
              format('Case %s has been resume-ready for 24h with no action.', v_wait.case_number));
    end loop;
    update maintenance.waits set last_escalated_at = now() where id = v_wait.wait_id;
    v_count_24h := v_count_24h + 1;
  end loop;

  -- §7.2: after Manager escalation, repeat every 24h until resumed.
  for v_wait in
    select w.id as wait_id, w.case_id, c.case_number
    from maintenance.waits w
    join maintenance.cases c on c.id = w.case_id
    where w.resume_ready_at is not null
      and w.resumed_at is null
      and w.last_escalated_at is not null
      and w.last_escalated_at <= now() - interval '24 hours'
  loop
    for v_manager in select id from maintenance.staff where role = 'MAINTENANCE_MANAGER' and is_active loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_manager.id, v_wait.case_id, 'WAIT_MANAGER_REMINDER_24H',
              format('Reminder: case %s is still resume-ready and unresolved since escalation.', v_wait.case_number));
    end loop;
    update maintenance.waits set last_escalated_at = now() where id = v_wait.wait_id;
    v_count_reminder := v_count_reminder + 1;
  end loop;

  -- §7.3: confirmed emergency, 1h threshold, fired once (no repeat cadence locked for it).
  for v_case in
    select id, case_number, current_owner_user_id
    from maintenance.cases
    where emergency_confirmed = true
      and emergency_escalated_at is null
      and emergency_confirmed_at <= now() - interval '1 hour'
      and status not in ('CLOSED', 'REJECTED', 'DUPLICATE')
  loop
    if v_case.current_owner_user_id is not null then
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_case.current_owner_user_id, v_case.id, 'EMERGENCY_ESCALATION_1H',
              format('Confirmed emergency case %s unresolved 1h after confirmation.', v_case.case_number));
    end if;
    for v_manager in select id from maintenance.staff where role = 'MAINTENANCE_MANAGER' and is_active loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_manager.id, v_case.id, 'EMERGENCY_ESCALATION_1H',
              format('Confirmed emergency case %s unresolved 1h after confirmation.', v_case.case_number));
    end loop;
    update maintenance.cases set emergency_escalated_at = now() where id = v_case.id;
    v_count_emergency := v_count_emergency + 1;
  end loop;

  return jsonb_build_object(
    'wait_escalations_24h', v_count_24h,
    'wait_reminders_24h', v_count_reminder,
    'emergency_escalations_1h', v_count_emergency,
    'scanned_at', now()
  );
end;
$$;

revoke execute on function maintenance.run_escalation_scan() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- pg_cron schedule. Both extensions were confirmed available-but-not-installed
-- on this project before writing this migration.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'maintenance-escalation-scan') then
    perform cron.unschedule('maintenance-escalation-scan');
  end if;
end $$;

select cron.schedule(
  'maintenance-escalation-scan',
  '*/5 * * * *',
  $$select maintenance.run_escalation_scan();$$
);
