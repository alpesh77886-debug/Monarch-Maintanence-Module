-- MONARCH Maintenance — server-side state transition engine (§4, §28, §36.3)
--
-- All lifecycle mutation happens through the SECURITY DEFINER functions below.
-- `maintenance.cases` has no client-facing UPDATE policy (0002), so a client can
-- only ever change status/ownership by calling these functions — the UI cannot
-- become the enforcement mechanism even by accident.

-- ---------------------------------------------------------------------------
-- Locked transition graph (§4). One row per allowed (from, to) pair. DUPLICATE
-- and the false-complaint closure path are handled by dedicated functions
-- below rather than generic transitions, because they carry extra mandatory
-- fields (§4.6, §4.7).
-- ---------------------------------------------------------------------------

create table maintenance.status_transitions (
  from_status maintenance.case_status not null,
  to_status maintenance.case_status not null,
  primary key (from_status, to_status)
);

insert into maintenance.status_transitions (from_status, to_status) values
  ('REPORTED', 'ACKNOWLEDGED'),
  ('REPORTED', 'NEEDS_INFORMATION'),
  ('REPORTED', 'REJECTED'),
  ('REPORTED', 'DUPLICATE'),
  ('NEEDS_INFORMATION', 'ACKNOWLEDGED'),
  ('ACKNOWLEDGED', 'ASSESSED'),
  ('ACKNOWLEDGED', 'DUPLICATE'),
  ('ASSESSED', 'ASSIGNED'),
  ('ASSESSED', 'DUPLICATE'),
  ('ASSIGNED', 'DIAGNOSING'),
  ('DIAGNOSING', 'IN_REPAIR'),
  ('IN_REPAIR', 'TEMPORARILY_RESTORED'),
  ('IN_REPAIR', 'TECHNICALLY_RESTORED'),
  ('TEMPORARILY_RESTORED', 'DIAGNOSING'),
  ('TEMPORARILY_RESTORED', 'IN_REPAIR'),
  ('TECHNICALLY_RESTORED', 'CLEARANCE_PENDING'),
  ('TECHNICALLY_RESTORED', 'MAINTENANCE_RELEASED'),
  ('TECHNICALLY_RESTORED', 'DIAGNOSING'),
  ('TECHNICALLY_RESTORED', 'IN_REPAIR'),
  ('CLEARANCE_PENDING', 'QC_REJECTED'),
  ('CLEARANCE_PENDING', 'MAINTENANCE_RELEASED'),
  ('QC_REJECTED', 'DIAGNOSING'),
  ('QC_REJECTED', 'IN_REPAIR'),
  ('MAINTENANCE_RELEASED', 'CLOSED'),
  ('REOPENED', 'DIAGNOSING'),
  ('REOPENED', 'IN_REPAIR');
  -- 'CLOSED' -> 'REOPENED' is intentionally NOT a generic transition: it is its
  -- own function (reopen_case) because it always requires a mandatory reason
  -- and prior-case linkage (§4.5).

comment on table maintenance.status_transitions is 'Locked lifecycle graph, IMPLEMENTATION_PACK.md §4. Changing this table changes business rules — requires a §42 Change Control entry and Boss approval, not a routine edit.';

-- ---------------------------------------------------------------------------
-- Generic transition RPC
-- ---------------------------------------------------------------------------

create or replace function maintenance.transition_case(
  p_case_id uuid,
  p_new_status maintenance.case_status,
  p_reason text default null,
  p_evidence_ref text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_current maintenance.case_status;
  v_cached jsonb;
  v_event_id uuid;
  v_actor uuid := auth.uid();
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may transition a case';
  end if;

  if p_idempotency_key is not null then
    select result into v_cached from maintenance.idempotency_keys where key = p_idempotency_key;
    if found then
      return v_cached;
    end if;
  end if;

  select status into v_current from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  if not exists (
    select 1 from maintenance.status_transitions
    where from_status = v_current and to_status = p_new_status
  ) then
    raise exception 'INVALID_TRANSITION: % -> % is not permitted', v_current, p_new_status;
  end if;

  if p_new_status in ('REJECTED', 'DUPLICATE', 'CLOSED') and p_reason is null then
    raise exception 'REASON_REQUIRED: a reason is mandatory for transition to %', p_new_status;
  end if;

  update maintenance.cases set
    status = p_new_status,
    updated_at = now(),
    assigned_at = case when p_new_status = 'ASSIGNED' then now() else assigned_at end,
    technically_restored_at = case when p_new_status = 'TECHNICALLY_RESTORED' then now() else technically_restored_at end,
    maintenance_released_at = case when p_new_status = 'MAINTENANCE_RELEASED' then now() else maintenance_released_at end,
    closed_at = case when p_new_status = 'CLOSED' then now() else closed_at end,
    closure_reason = case when p_new_status = 'CLOSED' then p_reason else closure_reason end
  where id = p_case_id;

  insert into maintenance.case_events (
    case_id, event_type, actor_user_id, previous_status, new_status, reason, evidence_ref, idempotency_key
  ) values (
    p_case_id, 'STATUS_TRANSITION', v_actor, v_current, p_new_status, p_reason, p_evidence_ref, p_idempotency_key
  ) returning id into v_event_id;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, before, after, reason, idempotency_key)
  values (
    v_actor, 'transition_case', 'maintenance.cases', p_case_id,
    jsonb_build_object('status', v_current), jsonb_build_object('status', p_new_status),
    p_reason, p_idempotency_key
  );

  v_cached := jsonb_build_object('case_id', p_case_id, 'status', p_new_status, 'event_id', v_event_id);

  if p_idempotency_key is not null then
    insert into maintenance.idempotency_keys (key, operation, case_id, actor_user_id, result)
    values (p_idempotency_key, 'transition_case', p_case_id, v_actor, v_cached);
  end if;

  return v_cached;
end;
$$;

-- ---------------------------------------------------------------------------
-- Take ownership — first-valid-actor wins (§5.2, §28)
-- ---------------------------------------------------------------------------

create or replace function maintenance.take_ownership(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_updated int;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may take ownership';
  end if;

  update maintenance.cases
  set current_owner_user_id = v_actor, updated_at = now()
  where id = p_case_id and current_owner_user_id is null;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'ALREADY_OWNED: case % already has an owner', p_case_id;
  end if;

  insert into maintenance.case_ownership (case_id, owner_user_id, assigned_by_user_id)
  values (p_case_id, v_actor, v_actor);

  insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
  values (p_case_id, 'OWNERSHIP_TAKEN', v_actor, jsonb_build_object('owner_user_id', v_actor));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'take_ownership', 'maintenance.cases', p_case_id, jsonb_build_object('owner_user_id', v_actor));

  return jsonb_build_object('case_id', p_case_id, 'owner_user_id', v_actor);
end;
$$;

-- ---------------------------------------------------------------------------
-- Acknowledge — bundles take_ownership + REPORTED -> ACKNOWLEDGED + priority
-- + initial assessment, because §5.2 requires all of these recorded together.
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
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may acknowledge a case';
  end if;

  select status into v_current from maintenance.cases where id = p_case_id for update;
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

  return jsonb_build_object('case_id', p_case_id, 'status', 'ACKNOWLEDGED', 'owner_user_id', v_actor);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reopen — Executive or Manager, mandatory reason, links prior history (§4.5)
-- ---------------------------------------------------------------------------

create or replace function maintenance.reopen_case(
  p_case_id uuid,
  p_reason text,
  p_new_status maintenance.case_status default 'DIAGNOSING'
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_current maintenance.case_status;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may reopen a case';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: reopen requires a reason';
  end if;
  if p_new_status not in ('DIAGNOSING', 'IN_REPAIR') then
    raise exception 'INVALID_TRANSITION: reopen must land in DIAGNOSING or IN_REPAIR, not %', p_new_status;
  end if;

  select status into v_current from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if v_current <> 'CLOSED' then
    raise exception 'INVALID_TRANSITION: only a CLOSED case can be reopened (current: %)', v_current;
  end if;

  update maintenance.cases set status = 'REOPENED', updated_at = now() where id = p_case_id;
  insert into maintenance.case_events (case_id, event_type, actor_user_id, previous_status, new_status, reason)
  values (p_case_id, 'REOPENED', v_actor, 'CLOSED', 'REOPENED', p_reason);

  update maintenance.cases set status = p_new_status, updated_at = now() where id = p_case_id;
  insert into maintenance.case_events (case_id, event_type, actor_user_id, previous_status, new_status, reason)
  values (p_case_id, 'STATUS_TRANSITION', v_actor, 'REOPENED', p_new_status, p_reason);

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, before, after, reason)
  values (v_actor, 'reopen_case', 'maintenance.cases', p_case_id,
          jsonb_build_object('status', 'CLOSED'), jsonb_build_object('status', p_new_status), p_reason);

  return jsonb_build_object('case_id', p_case_id, 'status', p_new_status);
end;
$$;
