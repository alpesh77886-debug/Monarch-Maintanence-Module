-- MONARCH Maintenance — Loop 4: WAITING dependency overlay (§7).
--
-- WAITING is explicitly NOT a case lifecycle status (§7: "a dependency/hold
-- overlay, not a competing second lifecycle") — case.status is untouched by
-- these RPCs. A case is "currently waiting" iff it has a maintenance.waits
-- row with resumed_at is null. reason_type is always an explicit staff
-- choice, never inferred from reason_text (§7.1).

drop policy if exists waits_insert on maintenance.waits;

create policy waits_insert on maintenance.waits
  for insert to authenticated
  with check (false); -- all writes go through the RPCs below

create or replace function maintenance.enter_waiting(
  p_case_id uuid,
  p_reason_type text,
  p_reason_text text,
  p_dependency_ref text default null,
  p_expected_resolution_info text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_wait_id uuid;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may put a case into WAITING';
  end if;
  if p_reason_type not in ('INTERNAL', 'EXTERNAL') then
    raise exception 'REASON_TYPE_REQUIRED: reason_type must be explicitly INTERNAL or EXTERNAL, got %', p_reason_type;
  end if;
  if p_reason_text is null or length(trim(p_reason_text)) = 0 then
    raise exception 'REASON_TEXT_REQUIRED: a free-text reason is mandatory';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if exists (select 1 from maintenance.waits where case_id = p_case_id and resumed_at is null) then
    raise exception 'ALREADY_WAITING: case % already has an open WAITING entry', p_case_id;
  end if;

  insert into maintenance.waits (
    case_id, reason_type, reason_text, owner_user_id, dependency_ref, expected_resolution_info
  ) values (
    p_case_id, p_reason_type, p_reason_text, v_actor, p_dependency_ref, p_expected_resolution_info
  ) returning id into v_wait_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'WAITING_ENTERED', v_actor, p_reason_text,
          jsonb_build_object('wait_id', v_wait_id, 'reason_type', p_reason_type));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'enter_waiting', 'maintenance.waits', v_wait_id,
          jsonb_build_object('case_id', p_case_id, 'reason_type', p_reason_type), p_reason_text);

  return jsonb_build_object('wait_id', v_wait_id, 'case_id', p_case_id);
end;
$$;

-- External dependency explicitly resolved -> automatic resume-ready (§7.2).
-- This does NOT resume the case by itself; it only flips it to resume-ready
-- and is recorded as such, matching "immediate notification ... dashboard
-- visibility" rather than silently continuing the lifecycle.
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

  return jsonb_build_object('wait_id', p_wait_id, 'case_id', v_case_id, 'resume_ready', true);
end;
$$;

-- Actual resume: manual for INTERNAL (§7.2), or after an EXTERNAL wait has
-- been marked resolved. Either way this is the point the case is picked back
-- up — always an explicit Executive/Manager action, never automatic.
create or replace function maintenance.resume_wait(p_wait_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_reason_type text;
  v_resume_ready_at timestamptz;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may resume a case from WAITING';
  end if;

  select case_id, reason_type, resume_ready_at into v_case_id, v_reason_type, v_resume_ready_at
  from maintenance.waits where id = p_wait_id and resumed_at is null
  for update;
  if not found then
    raise exception 'WAIT_NOT_FOUND_OR_ALREADY_RESUMED: %', p_wait_id;
  end if;
  if v_reason_type = 'EXTERNAL' and v_resume_ready_at is null then
    raise exception 'NOT_RESUME_READY: mark the external dependency resolved before resuming';
  end if;

  update maintenance.waits set
    resumed_at = now(),
    resume_type = case when v_reason_type = 'EXTERNAL' then 'AUTO_EXTERNAL' else 'MANUAL_INTERNAL' end
  where id = p_wait_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
  values (v_case_id, 'WAITING_RESUMED', v_actor, jsonb_build_object('wait_id', p_wait_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'resume_wait', 'maintenance.waits', p_wait_id, jsonb_build_object('case_id', v_case_id));

  return jsonb_build_object('wait_id', p_wait_id, 'case_id', v_case_id, 'resumed', true);
end;
$$;
