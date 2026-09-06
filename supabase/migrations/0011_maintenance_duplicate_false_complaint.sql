-- MONARCH Maintenance — Loop 9: duplicate case linkage (§4.6) and
-- false/wrong complaint closure by the reporter (§4.7).

-- ---------------------------------------------------------------------------
-- §4.6: "link to primary case" is a locked requirement that the generic
-- transition_case RPC cannot satisfy (it only knows from/to status, not a
-- second case reference). The status_transitions rows for DUPLICATE already
-- exist (0003) as the graph-of-truth documentation, but calling
-- transition_case directly would silently skip the link. Add the column,
-- then close that gap by refusing DUPLICATE through the generic path and
-- routing it through a dedicated function instead — same shape as
-- reopen_case (0003), which already does its own status update rather than
-- go through transition_case.
-- ---------------------------------------------------------------------------

alter table maintenance.cases
  add column if not exists duplicate_of_case_id uuid references maintenance.cases(id);

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

  if p_new_status = 'DUPLICATE' then
    raise exception 'USE_MARK_DUPLICATE_CASE: call mark_duplicate_case(...) instead — §4.6 requires linking the primary case, which this generic transition cannot record';
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

create or replace function maintenance.mark_duplicate_case(
  p_case_id uuid,
  p_primary_case_id uuid,
  p_reason text
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
    raise exception 'FORBIDDEN: only Maintenance staff may mark a case duplicate';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: marking a case duplicate requires a reason';
  end if;
  if p_case_id = p_primary_case_id then
    raise exception 'INVALID_PRIMARY: a case cannot be a duplicate of itself';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_primary_case_id) then
    raise exception 'PRIMARY_CASE_NOT_FOUND: %', p_primary_case_id;
  end if;

  select status into v_current from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if not exists (
    select 1 from maintenance.status_transitions
    where from_status = v_current and to_status = 'DUPLICATE'
  ) then
    raise exception 'INVALID_TRANSITION: cannot mark a case duplicate from status %', v_current;
  end if;

  -- §4.6: "primary remains active" — this function never touches the
  -- primary case's own status/ownership, only records the link on the
  -- duplicate side.
  update maintenance.cases set
    status = 'DUPLICATE',
    duplicate_of_case_id = p_primary_case_id,
    updated_at = now()
  where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, previous_status, new_status, reason, metadata)
  values (p_case_id, 'MARKED_DUPLICATE', v_actor, v_current, 'DUPLICATE', p_reason,
          jsonb_build_object('primary_case_id', p_primary_case_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, before, after, reason)
  values (v_actor, 'mark_duplicate_case', 'maintenance.cases', p_case_id,
          jsonb_build_object('status', v_current),
          jsonb_build_object('status', 'DUPLICATE', 'duplicate_of_case_id', p_primary_case_id), p_reason);

  return jsonb_build_object('case_id', p_case_id, 'status', 'DUPLICATE', 'primary_case_id', p_primary_case_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- §4.7: the reporting PERSON (not staff) may close a false/wrong complaint —
-- a distinct actor and trigger from the Executive's §5.3 "reject complaint"
-- path, which is why this is its own function rather than reusing
-- transition_case (which is staff-only). Lands in the existing REJECTED
-- status — the pack does not define a separate terminal status for this, and
-- REJECTED is the only locked "this complaint did not proceed" state.
-- `p_closure_reason` is left as caller-supplied text rather than a
-- hardcoded enum: the pack requires "a predefined closure reason" exist
-- but never enumerates the values, and inventing that business taxonomy
-- here would be exactly the kind of business-rule invention CLAUDE.md
-- prohibits — the UI is the right place to offer a fixed reason list. What
-- IS enforced here, literally, is the OTHER+explanation rule.
-- ---------------------------------------------------------------------------

create or replace function maintenance.close_false_complaint(
  p_case_id uuid,
  p_closure_reason text,
  p_other_explanation text default null
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
begin
  select status, reporter_user_id into v_current, v_reporter
  from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if v_actor <> v_reporter then
    raise exception 'FORBIDDEN: only the reporting person may close a false/wrong complaint';
  end if;
  if p_closure_reason is null or length(trim(p_closure_reason)) = 0 then
    raise exception 'REASON_REQUIRED: a predefined closure reason is mandatory';
  end if;
  if p_closure_reason = 'OTHER' and (p_other_explanation is null or length(trim(p_other_explanation)) = 0) then
    raise exception 'EXPLANATION_REQUIRED: an explanation is mandatory when the closure reason is OTHER';
  end if;
  if not exists (
    select 1 from maintenance.status_transitions
    where from_status = v_current and to_status = 'REJECTED'
  ) then
    raise exception 'INVALID_TRANSITION: cannot close a false/wrong complaint from status %', v_current;
  end if;

  update maintenance.cases set status = 'REJECTED', updated_at = now() where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, previous_status, new_status, reason, metadata)
  values (
    p_case_id, 'FALSE_COMPLAINT_CLOSED', v_actor, v_current, 'REJECTED',
    case when p_closure_reason = 'OTHER' then p_other_explanation else p_closure_reason end,
    jsonb_build_object('closure_reason', p_closure_reason, 'other_explanation', p_other_explanation)
  );

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, before, after, reason)
  values (v_actor, 'close_false_complaint', 'maintenance.cases', p_case_id,
          jsonb_build_object('status', v_current), jsonb_build_object('status', 'REJECTED'), p_closure_reason);

  return jsonb_build_object('case_id', p_case_id, 'status', 'REJECTED');
end;
$$;
