-- ---------------------------------------------------------------------------
-- RISK-25 part 2 — INTERNAL waits join the EXISTING 24h escalation.
--
-- The brief is explicit: use the existing escalation infrastructure, do not
-- invent a second engine, do not shorten or extend the approved 24-hour rule,
-- and escalation must never equal resolution.
--
-- So the SAME 24h branch now serves both wait types. The only thing that
-- differs is where each type's clock starts, and that is forced by the data
-- model rather than chosen:
--   EXTERNAL — starts at resume_ready_at (the dependency was explicitly
--              resolved and nobody acted). Unchanged.
--   INTERNAL — has no resume-ready state at all, because mark_wait_resolved
--              refuses non-EXTERNAL waits by design. So the clock starts at
--              entered_at. This start point is Boss-supplied evidence closing
--              RISK-25, not an invented threshold.
--
-- Idempotency is the existing mechanism, unchanged: last_escalated_at is
-- stamped inside the loop, and the branch only selects waits where it is null,
-- so a repeated scan cannot escalate the same wait twice.
--
-- Escalation NOTIFIES. It never resolves. It cannot grant the reporting
-- manager's approval, release a Purchase Order, or settle an "Other" reason —
-- authority stays with the real actor.
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
  for v_wait in
    select w.id as wait_id, w.case_id, w.reason_type, c.case_number, c.current_owner_user_id
    from maintenance.waits w
    join maintenance.cases c on c.id = w.case_id
    where w.resumed_at is null
      and w.last_escalated_at is null
      and (
        (w.reason_type = 'EXTERNAL'
           and w.resume_ready_at is not null
           and w.resume_ready_at <= now() - interval '24 hours')
        or
        (w.reason_type = 'INTERNAL'
           and w.entered_at <= now() - interval '24 hours')
      )
  loop
    for v_recipient in
      select maintenance.case_notification_recipients(v_wait.current_owner_user_id)
    loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_recipient, v_wait.case_id, 'WAIT_ESCALATION_24H',
              case when v_wait.reason_type = 'INTERNAL'
                   then format('Case %s has been on an INTERNAL dependency for 24h with no resolution.', v_wait.case_number)
                   else format('Case %s has been resume-ready for 24h with no action.', v_wait.case_number)
              end);
    end loop;
    update maintenance.waits set last_escalated_at = now() where id = v_wait.wait_id;
    v_count_24h := v_count_24h + 1;
  end loop;

  -- Manager reminder every 24h until resolved. Already type-agnostic, so it
  -- serves INTERNAL waits with no change at all.
  for v_wait in
    select w.id as wait_id, w.case_id, c.case_number
    from maintenance.waits w
    join maintenance.cases c on c.id = w.case_id
    where w.resumed_at is null
      and w.last_escalated_at is not null
      and w.last_escalated_at <= now() - interval '24 hours'
  loop
    for v_recipient in select maintenance.case_notification_recipients(null) loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_recipient, v_wait.case_id, 'WAIT_MANAGER_REMINDER_24H',
              format('Reminder: case %s is still waiting and unresolved since escalation.', v_wait.case_number));
    end loop;
    update maintenance.waits set last_escalated_at = now() where id = v_wait.wait_id;
    v_count_reminder := v_count_reminder + 1;
  end loop;

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
