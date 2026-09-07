-- ---------------------------------------------------------------------------
-- RISK-26 — duplicate notification delivery (§23)
--
-- §23 is explicit on two points: "Notifications are event-driven, not
-- spam-driven" and "Notification delivery must be idempotent and auditable."
-- Three notification sites violated both, by construction rather than by race.
--
-- The pattern: send to the case owner (or PM-responsible person), THEN loop
-- every active Maintenance Manager. When the owner IS a Manager — which is
-- entirely normal, a Manager can own a case — that person appears in both
-- sets and receives two byte-identical rows for one event.
--
-- Found live, and the evidence rules out a concurrency explanation: the
-- duplicate pairs on case MC-000077 carry timestamps identical to the
-- MICROSECOND (09:54:18.629383 twice, 09:54:55.425613 twice). Identical
-- microsecond timestamps mean one transaction, one scan pass — not two
-- overlapping cron runs. The case's CASE_ACKNOWLEDGED row confirms the
-- Manager owned it at that moment.
--
-- Scale is not "one extra row in test data": with N active Managers, an
-- owner-Manager gets 2 notifications while every other Manager gets 1, on
-- every escalation, forever.
--
-- Deliberately NOT affected, checked and left alone: the handover
-- CASE_UNASSIGNED path (0014), the production-boundary breach (0015) and the
-- safety-stop raise (0030) all notify Managers ONLY, with no separate owner
-- send, so they have no overlap to dedupe.
-- ---------------------------------------------------------------------------

-- One place that answers "who should hear about this case event", with the
-- overlap removed. Adding a recipient in future means adding it here, not
-- adding another loop that can collide with the existing ones.
create or replace function maintenance.case_notification_recipients(p_extra uuid)
returns setof uuid
language sql
stable
security definer
set search_path = maintenance, public
as $$
  select distinct r from (
    select p_extra as r where p_extra is not null
    union
    select s.id from maintenance.staff s
    where s.role = 'MAINTENANCE_MANAGER' and s.is_active
  ) x;
$$;

comment on function maintenance.case_notification_recipients(uuid) is
  'RISK-26: deduplicated recipient set for a case-scoped notification — the given extra recipient (case owner / PM responsible) plus every active Maintenance Manager, each exactly once. §23 requires idempotent delivery; an owner who is also a Manager must not be told twice.';

-- ---------------------------------------------------------------------------
-- run_escalation_scan — same logic, deduplicated recipients.
-- The escalation rules, thresholds, guards and once-only semantics
-- (last_escalated_at / emergency_escalated_at) are unchanged.
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
  v_recipient uuid;
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
    for v_recipient in
      select maintenance.case_notification_recipients(v_wait.current_owner_user_id)
    loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_recipient, v_wait.case_id, 'WAIT_ESCALATION_24H',
              format('Case %s has been resume-ready for 24h with no action.', v_wait.case_number));
    end loop;
    update maintenance.waits set last_escalated_at = now() where id = v_wait.wait_id;
    v_count_24h := v_count_24h + 1;
  end loop;

  -- §7.2: after Manager escalation, repeat every 24h until resumed.
  -- Managers only by design — this is the Manager reminder, so there is no
  -- owner send here and nothing to dedupe.
  for v_wait in
    select w.id as wait_id, w.case_id, c.case_number
    from maintenance.waits w
    join maintenance.cases c on c.id = w.case_id
    where w.resume_ready_at is not null
      and w.resumed_at is null
      and w.last_escalated_at is not null
      and w.last_escalated_at <= now() - interval '24 hours'
  loop
    for v_recipient in select maintenance.case_notification_recipients(null) loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_recipient, v_wait.case_id, 'WAIT_MANAGER_REMINDER_24H',
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
    for v_recipient in
      select maintenance.case_notification_recipients(v_case.current_owner_user_id)
    loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_recipient, v_case.id, 'EMERGENCY_ESCALATION_1H',
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

-- ---------------------------------------------------------------------------
-- run_pm_scan — same generation logic, deduplicated overdue recipients.
-- ---------------------------------------------------------------------------

create or replace function maintenance.run_pm_scan()
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_plan record;
  v_last_due timestamptz;
  v_next_due timestamptz;
  v_instance record;
  v_recipient uuid;
  v_count_generated int := 0;
  v_count_overdue int := 0;
begin
  for v_plan in
    select id, frequency_days, approved_at
    from maintenance.pm_plans
    where plan_type = 'RECURRING' and is_active and approved_by is not null
  loop
    select max(due_at) into v_last_due from maintenance.pm_instances
    where pm_plan_id = v_plan.id and status <> 'RESCHEDULED';

    if v_last_due is null then
      v_next_due := v_plan.approved_at + make_interval(days => v_plan.frequency_days);
    elsif v_last_due + make_interval(days => v_plan.frequency_days) <= now() then
      v_next_due := v_last_due + make_interval(days => v_plan.frequency_days);
    else
      v_next_due := null;
    end if;

    if v_next_due is not null and v_next_due <= now() then
      insert into maintenance.pm_instances (pm_plan_id, due_at, status)
      values (v_plan.id, v_next_due, 'SCHEDULED');
      v_count_generated := v_count_generated + 1;
    end if;
  end loop;

  for v_instance in
    select i.id as instance_id, i.pm_plan_id, i.case_id, p.title, p.created_by,
           coalesce(c.current_owner_user_id, p.created_by) as responsible_user_id
    from maintenance.pm_instances i
    join maintenance.pm_plans p on p.id = i.pm_plan_id
    left join maintenance.cases c on c.id = i.case_id
    where i.status = 'SCHEDULED' and i.due_at < now()
  loop
    update maintenance.pm_instances set status = 'OVERDUE', overdue_since = now() where id = v_instance.instance_id;

    for v_recipient in
      select maintenance.case_notification_recipients(v_instance.responsible_user_id)
    loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_recipient, v_instance.case_id, 'PM_OVERDUE',
              format('PM "%s" is overdue.', v_instance.title));
    end loop;
    v_count_overdue := v_count_overdue + 1;
  end loop;

  return jsonb_build_object(
    'instances_generated', v_count_generated,
    'instances_flagged_overdue', v_count_overdue,
    'scanned_at', now()
  );
end;
$$;
