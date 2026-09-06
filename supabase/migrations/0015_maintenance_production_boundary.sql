-- MONARCH Maintenance — Loop 13: production restart boundary (§13).
--
-- §13.1 requires recording PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE
-- with an "active stop reference" — but no Maintenance safety/technical stop
-- was ever modelled, so there was nothing to reference. This adds the stop
-- itself, then the two boundary records (§13.1, §13.2).
--
-- Maintenance MUST NOT become Production's line-start authority (§13). None
-- of this authorises or blocks a line start: it records what Maintenance
-- observed. A stop is raised and lifted only by an explicit human action
-- (§24 HUMAN REQUIRED: "Maintenance safety/technical stop"; NEVER AUTOMATE:
-- "silently override safety stop") — nothing here lifts a stop implicitly,
-- and recording a violation deliberately leaves the stop standing (§13.1:
-- "Do not silently clear the stop").

-- §23 minimum notifications, extended for the §13.1 breach. Done first so the
-- constraint is in place before the function that writes this type exists.
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
    'CASE_UNASSIGNED',
    'PRODUCTION_BOUNDARY_BREACH'
  ));

create table maintenance.safety_stops (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  stop_type text not null check (stop_type in ('SAFETY', 'TECHNICAL')),
  machine_ref text,
  line_ref text,
  reason text not null,
  raised_by uuid not null references maintenance.staff(id),
  raised_at timestamptz not null default now(),
  lifted_by uuid references maintenance.staff(id),
  lifted_at timestamptz,
  lift_reason text
);

create index on maintenance.safety_stops (case_id);
-- At most one active stop per case: a second "active" stop on the same case
-- would make "the active stop reference" (§13.1) ambiguous.
create unique index safety_stops_one_active_per_case
  on maintenance.safety_stops (case_id)
  where lifted_at is null;

alter table maintenance.safety_stops enable row level security;

create policy safety_stops_select on maintenance.safety_stops
  for select to authenticated using (true);

create policy safety_stops_insert on maintenance.safety_stops
  for insert to authenticated with check (false); -- RPC-only

create policy safety_stops_update on maintenance.safety_stops
  for update to authenticated using (false); -- RPC-only; never silently lifted

-- §13.1/§13.2 boundary records. These live in their own table rather than
-- only in case_events because they carry required structured fields
-- (machine/line, the stop reference) and because §25 KPI reporting needs to
-- count them; they are ALSO mirrored into case_events so the case's single
-- audit trail stays complete.
create table maintenance.production_boundary_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  event_type text not null check (event_type in (
    'PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE',
    'PRODUCTION_NOT_RESTARTED'
  )),
  safety_stop_id uuid references maintenance.safety_stops(id),
  machine_ref text,
  line_ref text,
  reason text not null,
  recorded_by uuid not null references maintenance.staff(id),
  recorded_at timestamptz not null default now(),
  case_status_at_record maintenance.case_status not null
);

create index on maintenance.production_boundary_events (case_id);
create index on maintenance.production_boundary_events (event_type);

alter table maintenance.production_boundary_events enable row level security;

create policy production_boundary_events_select on maintenance.production_boundary_events
  for select to authenticated using (true);

create policy production_boundary_events_insert on maintenance.production_boundary_events
  for insert to authenticated with check (false); -- RPC-only, append-only

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
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
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

  return jsonb_build_object('safety_stop_id', v_stop_id, 'case_id', p_case_id, 'stop_type', p_stop_type);
end;
$$;

-- Lifting is always an explicit human act with its own reason. There is no
-- code path anywhere that lifts a stop as a side effect of something else —
-- §24 lists "silently override safety stop" under NEVER AUTOMATE.
create or replace function maintenance.lift_safety_stop(
  p_safety_stop_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_lifted_at timestamptz;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may lift a safety/technical stop';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: lifting a stop requires a reason';
  end if;

  select case_id, lifted_at into v_case_id, v_lifted_at
  from maintenance.safety_stops where id = p_safety_stop_id for update;
  if not found then
    raise exception 'STOP_NOT_FOUND: %', p_safety_stop_id;
  end if;
  if v_lifted_at is not null then
    raise exception 'ALREADY_LIFTED: stop % was already lifted', p_safety_stop_id;
  end if;

  update maintenance.safety_stops
  set lifted_by = v_actor, lifted_at = now(), lift_reason = p_reason
  where id = p_safety_stop_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case_id, 'SAFETY_STOP_LIFTED', v_actor, p_reason,
          jsonb_build_object('safety_stop_id', p_safety_stop_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'lift_safety_stop', 'maintenance.safety_stops', p_safety_stop_id,
          jsonb_build_object('case_id', v_case_id, 'lifted', true), p_reason);

  return jsonb_build_object('safety_stop_id', p_safety_stop_id, 'lifted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- §13.1 — Production started without Maintenance release.
-- "This is not a normal successful restart event. Do not silently clear the
-- stop." Accordingly this records, and does nothing else: it does not lift
-- the stop, does not move the case forward, and does not mark anything as
-- released.
-- ---------------------------------------------------------------------------

create or replace function maintenance.record_production_started_without_release(
  p_case_id uuid,
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
  v_status maintenance.case_status;
  v_stop_id uuid;
  v_event_id uuid;
  v_manager record;
  v_case_number text;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may record a production boundary event';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: reason/context is mandatory (§13.1)';
  end if;

  select status, case_number into v_status, v_case_number
  from maintenance.cases where id = p_case_id;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  -- "Without Maintenance release" means exactly that: if the case has been
  -- released or closed, a production start is the normal, expected outcome
  -- and recording it as a boundary violation would be false history.
  if v_status in ('MAINTENANCE_RELEASED', 'CLOSED') then
    raise exception 'ALREADY_RELEASED: case % is % — a production start after release is not a §13.1 event', p_case_id, v_status;
  end if;

  select id into v_stop_id
  from maintenance.safety_stops
  where case_id = p_case_id and lifted_at is null;

  insert into maintenance.production_boundary_events (
    case_id, event_type, safety_stop_id, machine_ref, line_ref, reason, recorded_by, case_status_at_record
  ) values (
    p_case_id, 'PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE', v_stop_id,
    p_machine_ref, p_line_ref, p_reason, v_actor, v_status
  ) returning id into v_event_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE', v_actor, p_reason,
          jsonb_build_object('boundary_event_id', v_event_id, 'safety_stop_id', v_stop_id,
                             'machine_ref', p_machine_ref, 'line_ref', p_line_ref,
                             'case_status_at_record', v_status));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'record_production_started_without_release',
          'maintenance.production_boundary_events', v_event_id,
          jsonb_build_object('case_id', p_case_id, 'safety_stop_id', v_stop_id), p_reason);

  -- A boundary breach that nobody is told about is not meaningfully
  -- recorded. Managers are the escalation authority (§3.2).
  for v_manager in select id from maintenance.staff where role = 'MAINTENANCE_MANAGER' and is_active loop
    insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
    values (v_manager.id, p_case_id, 'PRODUCTION_BOUNDARY_BREACH',
            format('Production started on case %s without Maintenance release.', v_case_number));
  end loop;

  return jsonb_build_object(
    'boundary_event_id', v_event_id,
    'case_id', p_case_id,
    'safety_stop_id', v_stop_id,
    'stop_still_active', v_stop_id is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- §13.2 — Shift ended before production restarted. Recording only: it does
-- not confirm a restart, and it deliberately does not gate closure —
-- "Maintenance may close if Maintenance-side conditions permit", which the
-- existing closure rules already govern.
-- ---------------------------------------------------------------------------

create or replace function maintenance.record_production_not_restarted(
  p_case_id uuid,
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
  v_status maintenance.case_status;
  v_event_id uuid;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may record a production boundary event';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: reason/context is mandatory (§13.2)';
  end if;

  select status into v_status from maintenance.cases where id = p_case_id;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  insert into maintenance.production_boundary_events (
    case_id, event_type, machine_ref, line_ref, reason, recorded_by, case_status_at_record
  ) values (
    p_case_id, 'PRODUCTION_NOT_RESTARTED', p_machine_ref, p_line_ref, p_reason, v_actor, v_status
  ) returning id into v_event_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'PRODUCTION_NOT_RESTARTED', v_actor, p_reason,
          jsonb_build_object('boundary_event_id', v_event_id, 'machine_ref', p_machine_ref,
                             'line_ref', p_line_ref, 'case_status_at_record', v_status));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'record_production_not_restarted',
          'maintenance.production_boundary_events', v_event_id,
          jsonb_build_object('case_id', p_case_id), p_reason);

  return jsonb_build_object('boundary_event_id', v_event_id, 'case_id', p_case_id);
end;
$$;
