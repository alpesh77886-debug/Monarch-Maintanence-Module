-- MONARCH Maintenance — Loop 10: preventive maintenance (§17).
--
-- `pm_plans`/`pm_instances` have existed since Loop 1, but (like
-- spare_requests before Loop 8) `pm_plans_insert` (0002) let any staff
-- member insert a row with a self-set `approved_by` — bypassing the locked
-- §17.3 "Manager approves PM schedule/plan" boundary entirely. `pm_instances`
-- never had a write path at all. This migration closes both gaps.

-- ---------------------------------------------------------------------------
-- Columns for auditable approval/completion (mirrors the approved_at pattern
-- already used for spare_requests in Loop 8).
-- ---------------------------------------------------------------------------

alter table maintenance.pm_plans
  add column if not exists approved_at timestamptz;

alter table maintenance.pm_instances
  add column if not exists completed_at timestamptz;

-- §23/§17.4: PM overdue is a locked minimum notification.
alter table maintenance.notifications
  drop constraint if exists notifications_notification_type_check;

alter table maintenance.notifications
  add constraint notifications_notification_type_check check (notification_type in (
    'CASE_ACKNOWLEDGED',
    'WAIT_RESUME_READY',
    'WAIT_ESCALATION_24H',
    'WAIT_MANAGER_REMINDER_24H',
    'EMERGENCY_ESCALATION_1H',
    'PM_OVERDUE'
  ));

-- ---------------------------------------------------------------------------
-- pm_plans: RPC-only writes, same reasoning as spare_requests (0009) — the
-- approval boundary must not be settable by direct insert.
-- ---------------------------------------------------------------------------

drop policy if exists pm_plans_insert on maintenance.pm_plans;

create policy pm_plans_insert on maintenance.pm_plans
  for insert to authenticated
  with check (false);

-- §17.1/§17.2/§17.3: a RECURRING plan may be proposed by any staff member
-- but needs Manager approval (approve_pm_plan) before it can generate
-- instances. A ONE_TIME plan may only be created by a Manager (§17.2
-- "Maintenance Manager may manually create special/one-time PM") and is
-- self-approved at creation — there is no separate approval step for it in
-- the locked text. Frequency is never invented: RECURRING requires one to
-- be explicitly supplied; ONE_TIME must not have one.
create or replace function maintenance.create_pm_plan(
  p_title text,
  p_plan_type text,
  p_asset_ref text default null,
  p_frequency_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_id uuid;
  v_approved_by uuid;
  v_approved_at timestamptz;
begin
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'TITLE_REQUIRED: a PM plan title is mandatory';
  end if;
  if p_plan_type not in ('RECURRING', 'ONE_TIME') then
    raise exception 'INVALID_PLAN_TYPE: plan_type must be RECURRING or ONE_TIME, got %', p_plan_type;
  end if;

  if p_plan_type = 'RECURRING' then
    if not maintenance.is_staff() then
      raise exception 'FORBIDDEN: only Maintenance staff may propose a recurring PM plan';
    end if;
    if p_frequency_days is null or p_frequency_days <= 0 then
      raise exception 'FREQUENCY_REQUIRED: a recurring PM plan requires an explicit frequency in days — none is invented here';
    end if;
    v_approved_by := null;
    v_approved_at := null;
  else
    if not maintenance.is_manager() then
      raise exception 'FORBIDDEN: only Maintenance Manager may create a special/one-time PM plan (§17.2)';
    end if;
    if p_frequency_days is not null then
      raise exception 'FREQUENCY_NOT_APPLICABLE: a one-time PM plan must not have a recurrence frequency';
    end if;
    -- Manager both creates and is the approval authority for §17.2 — no
    -- separate approval step is described in the locked text.
    v_approved_by := v_actor;
    v_approved_at := now();
  end if;

  insert into maintenance.pm_plans (
    title, asset_ref, plan_type, frequency_days, created_by, approved_by, approved_at
  ) values (
    p_title, p_asset_ref, p_plan_type, p_frequency_days, v_actor, v_approved_by, v_approved_at
  ) returning id into v_plan_id;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'create_pm_plan', 'maintenance.pm_plans', v_plan_id,
          jsonb_build_object('plan_type', p_plan_type, 'approved_by', v_approved_by));

  return jsonb_build_object('pm_plan_id', v_plan_id, 'plan_type', p_plan_type, 'approved', v_approved_by is not null);
end;
$$;

create or replace function maintenance.approve_pm_plan(p_pm_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_plan_type text;
  v_approved_by uuid;
begin
  if not maintenance.is_manager() then
    raise exception 'FORBIDDEN: only Maintenance Manager may approve a PM plan (§17.3)';
  end if;

  select plan_type, approved_by into v_plan_type, v_approved_by
  from maintenance.pm_plans where id = p_pm_plan_id for update;
  if not found then
    raise exception 'PM_PLAN_NOT_FOUND: %', p_pm_plan_id;
  end if;
  if v_approved_by is not null then
    raise exception 'ALREADY_APPROVED: PM plan % was already approved', p_pm_plan_id;
  end if;

  update maintenance.pm_plans set approved_by = v_actor, approved_at = now() where id = p_pm_plan_id;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'approve_pm_plan', 'maintenance.pm_plans', p_pm_plan_id, jsonb_build_object('approved', true));

  return jsonb_build_object('pm_plan_id', p_pm_plan_id, 'approved', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- §17.3: "Executive manages execution/assignment" — linking a PM instance to
-- an actual case is how execution starts; the case's own lifecycle then
-- takes over. complete_pm_instance is for instances that don't need a full
-- case (e.g. a quick inspection) or to close out the PM side once the linked
-- case is done.
-- ---------------------------------------------------------------------------

create or replace function maintenance.link_pm_instance_to_case(
  p_pm_instance_id uuid,
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may link a PM instance to a case';
  end if;
  if not exists (select 1 from maintenance.pm_instances where id = p_pm_instance_id) then
    raise exception 'PM_INSTANCE_NOT_FOUND: %', p_pm_instance_id;
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  update maintenance.pm_instances set case_id = p_case_id where id = p_pm_instance_id;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'link_pm_instance_to_case', 'maintenance.pm_instances', p_pm_instance_id,
          jsonb_build_object('case_id', p_case_id));

  return jsonb_build_object('pm_instance_id', p_pm_instance_id, 'case_id', p_case_id);
end;
$$;

create or replace function maintenance.complete_pm_instance(p_pm_instance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may complete a PM instance';
  end if;

  select status into v_status from maintenance.pm_instances where id = p_pm_instance_id for update;
  if not found then
    raise exception 'PM_INSTANCE_NOT_FOUND: %', p_pm_instance_id;
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'ALREADY_COMPLETED: PM instance % was already completed', p_pm_instance_id;
  end if;
  if v_status = 'RESCHEDULED' then
    raise exception 'INVALID_OPERATION: a RESCHEDULED instance was superseded — complete the instance it was rescheduled to instead';
  end if;

  update maintenance.pm_instances set status = 'COMPLETED', completed_at = now() where id = p_pm_instance_id;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'complete_pm_instance', 'maintenance.pm_instances', p_pm_instance_id,
          jsonb_build_object('status', 'COMPLETED'));

  return jsonb_build_object('pm_instance_id', p_pm_instance_id, 'status', 'COMPLETED');
end;
$$;

-- §17.4: "Rescheduling must not erase original overdue history" — so this
-- never updates due_at in place. It closes the old instance as RESCHEDULED
-- (its overdue_since, if any, stays on record) and opens a new SCHEDULED
-- one, linked back via the rescheduled_from_instance_id column that has
-- existed for exactly this since Loop 1.
create or replace function maintenance.reschedule_pm_instance(
  p_pm_instance_id uuid,
  p_new_due_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_pm_plan_id uuid;
  v_status text;
  v_new_instance_id uuid;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may reschedule a PM instance';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: rescheduling a PM instance requires a reason';
  end if;

  select pm_plan_id, status into v_pm_plan_id, v_status
  from maintenance.pm_instances where id = p_pm_instance_id for update;
  if not found then
    raise exception 'PM_INSTANCE_NOT_FOUND: %', p_pm_instance_id;
  end if;
  if v_status not in ('SCHEDULED', 'OVERDUE') then
    raise exception 'INVALID_OPERATION: only a SCHEDULED or OVERDUE instance can be rescheduled (current: %)', v_status;
  end if;

  update maintenance.pm_instances set status = 'RESCHEDULED' where id = p_pm_instance_id;

  insert into maintenance.pm_instances (pm_plan_id, due_at, status, rescheduled_from_instance_id)
  values (v_pm_plan_id, p_new_due_at, 'SCHEDULED', p_pm_instance_id)
  returning id into v_new_instance_id;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'reschedule_pm_instance', 'maintenance.pm_instances', p_pm_instance_id,
          jsonb_build_object('rescheduled_to', v_new_instance_id, 'new_due_at', p_new_due_at), p_reason);

  return jsonb_build_object('old_pm_instance_id', p_pm_instance_id, 'new_pm_instance_id', v_new_instance_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled scan (§24 AUTO: "recurring PM generation from approved
-- schedule", "PM overdue flagging"). Same cron-only pattern as
-- run_escalation_scan (0008) — EXECUTE revoked from clients below.
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
  v_manager record;
  v_count_generated int := 0;
  v_count_overdue int := 0;
begin
  -- Generate the next instance, one at a time, for each approved active
  -- RECURRING plan once its last-known instance has come due. This does not
  -- generate a lookahead batch — the pack asks for generation "from approved
  -- schedule", not a specific lookahead window, and inventing one would be
  -- exactly the kind of unapproved business parameter CLAUDE.md prohibits.
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

  -- Flag SCHEDULED instances past due as OVERDUE and alert (§17.4: alert
  -- responsible Executive + Manager). The schema has no per-plan "responsible
  -- Executive" field; the natural, already-auditable stand-in is the linked
  -- case's current owner once execution has started (link_pm_instance_to_case),
  -- falling back to the plan's own creator before that.
  for v_instance in
    select i.id as instance_id, i.pm_plan_id, i.case_id, p.title, p.created_by,
           coalesce(c.current_owner_user_id, p.created_by) as responsible_user_id
    from maintenance.pm_instances i
    join maintenance.pm_plans p on p.id = i.pm_plan_id
    left join maintenance.cases c on c.id = i.case_id
    where i.status = 'SCHEDULED' and i.due_at < now()
  loop
    update maintenance.pm_instances set status = 'OVERDUE', overdue_since = now() where id = v_instance.instance_id;

    if v_instance.responsible_user_id is not null then
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_instance.responsible_user_id, v_instance.case_id, 'PM_OVERDUE',
              format('PM "%s" is overdue.', v_instance.title));
    end if;
    for v_manager in select id from maintenance.staff where role = 'MAINTENANCE_MANAGER' and is_active loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_manager.id, v_instance.case_id, 'PM_OVERDUE',
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

revoke execute on function maintenance.run_pm_scan() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'maintenance-pm-scan') then
    perform cron.unschedule('maintenance-pm-scan');
  end if;
end $$;

select cron.schedule(
  'maintenance-pm-scan',
  '0 * * * *',
  $$select maintenance.run_pm_scan();$$
);
