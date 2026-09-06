-- MONARCH Maintenance — Loop 5: restoration/verification (§10, §11) + QC
-- clearance gate (§12), and the MAINTENANCE_RELEASED boundary guard (§13).

-- ---------------------------------------------------------------------------
-- Guard: MAINTENANCE_RELEASED can never be reached through the generic
-- transition_case RPC when qc_required is true — it must go through
-- send_to_qc -> qc_decision(CLEARED). This is the one place §13's boundary
-- ("QC/Clearance if required -> MAINTENANCE_RELEASED") is enforced, so a
-- caller cannot skip the gate by calling transition_case directly.
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
  v_qc_required boolean;
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

  select status, qc_required into v_current, v_qc_required
  from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  if not exists (
    select 1 from maintenance.status_transitions
    where from_status = v_current and to_status = p_new_status
  ) then
    raise exception 'INVALID_TRANSITION: % -> % is not permitted', v_current, p_new_status;
  end if;

  -- Only blocks the DIRECT TECHNICALLY_RESTORED -> MAINTENANCE_RELEASED edge
  -- when qc_required. The CLEARANCE_PENDING -> MAINTENANCE_RELEASED edge
  -- (only reachable via qc_decision(CLEARED), since CLEARANCE_PENDING can
  -- only be entered via send_to_qc) is intentionally NOT blocked here —
  -- that's the legitimate cleared path, not a bypass.
  if p_new_status = 'MAINTENANCE_RELEASED' and v_current = 'TECHNICALLY_RESTORED'
     and coalesce(v_qc_required, false) then
    raise exception 'QC_GATE: qc_required is true — use send_to_qc / qc_decision(CLEARED), not a direct transition';
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
-- QC-required flag — can be changed later by an Executive, always recorded (§12).
-- ---------------------------------------------------------------------------

create or replace function maintenance.set_qc_required(
  p_case_id uuid,
  p_qc_required boolean,
  p_reason text
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
    raise exception 'FORBIDDEN: only Maintenance staff may set QC required';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: changing QC required needs a reason';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  update maintenance.cases set
    qc_required = p_qc_required,
    qc_required_changed_by = v_actor,
    qc_required_changed_at = now(),
    qc_required_change_reason = p_reason,
    updated_at = now()
  where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'QC_REQUIRED_CHANGED', v_actor, p_reason, jsonb_build_object('qc_required', p_qc_required));

  return jsonb_build_object('case_id', p_case_id, 'qc_required', p_qc_required);
end;
$$;

-- ---------------------------------------------------------------------------
-- Restoration + verification (§10 temporary, §11 technical + failure path).
-- ---------------------------------------------------------------------------

create or replace function maintenance.record_restoration(
  p_case_id uuid,
  p_restoration_type text,
  p_details text,
  p_evidence_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_restoration_id uuid;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may record a restoration';
  end if;
  if p_restoration_type not in ('TEMPORARY', 'TECHNICAL') then
    raise exception 'INVALID_TYPE: restoration_type must be TEMPORARY or TECHNICAL';
  end if;

  insert into maintenance.restorations (case_id, restoration_type, recorded_by, details, evidence_ref)
  values (p_case_id, p_restoration_type, v_actor, p_details, p_evidence_ref)
  returning id into v_restoration_id;

  if p_restoration_type = 'TEMPORARY' then
    -- §10: temporary restoration is a real non-closure condition, never
    -- equivalent to permanent repair — the transition graph itself keeps it
    -- outside MAINTENANCE_RELEASED/CLOSED.
    perform maintenance.transition_case(p_case_id, 'TEMPORARILY_RESTORED', p_details, p_evidence_ref);
  else
    -- Technical completion is a claim pending verification (§11) — recorded
    -- as TECHNICALLY_RESTORED now; verify_restoration below either confirms
    -- it or sends the case back to DIAGNOSING/IN_REPAIR on failure, reusing
    -- the TECHNICALLY_RESTORED -> {DIAGNOSING,IN_REPAIR} edges already in
    -- the locked graph (§4.2).
    perform maintenance.transition_case(p_case_id, 'TECHNICALLY_RESTORED', p_details, p_evidence_ref);
  end if;

  return jsonb_build_object('restoration_id', v_restoration_id, 'case_id', p_case_id,
                             'restoration_type', p_restoration_type);
end;
$$;

create or replace function maintenance.verify_restoration(
  p_restoration_id uuid,
  p_passed boolean,
  p_failure_reason text default null,
  p_return_status maintenance.case_status default 'DIAGNOSING'
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_restoration_type text;
  v_existing_result text;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may record a verification result';
  end if;

  select case_id, restoration_type, verification_result
  into v_case_id, v_restoration_type, v_existing_result
  from maintenance.restorations where id = p_restoration_id for update;
  if not found then
    raise exception 'RESTORATION_NOT_FOUND: %', p_restoration_id;
  end if;
  if v_restoration_type <> 'TECHNICAL' then
    raise exception 'INVALID_OPERATION: only TECHNICAL restorations are verified';
  end if;
  if v_existing_result is not null then
    raise exception 'ALREADY_VERIFIED: restoration % already has a verification result', p_restoration_id;
  end if;

  if p_passed then
    update maintenance.restorations set verification_result = 'PASSED' where id = p_restoration_id;
    insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
    values (v_case_id, 'RESTORATION_VERIFIED', v_actor, jsonb_build_object('restoration_id', p_restoration_id, 'result', 'PASSED'));
    return jsonb_build_object('restoration_id', p_restoration_id, 'case_id', v_case_id, 'result', 'PASSED');
  else
    if p_failure_reason is null or length(trim(p_failure_reason)) = 0 then
      raise exception 'REASON_REQUIRED: a failure reason is mandatory when verification fails';
    end if;
    if p_return_status not in ('DIAGNOSING', 'IN_REPAIR') then
      raise exception 'INVALID_RETURN_STATUS: must be DIAGNOSING or IN_REPAIR, got %', p_return_status;
    end if;

    update maintenance.restorations set
      verification_result = 'FAILED',
      verification_failure_reason = p_failure_reason
    where id = p_restoration_id;

    perform maintenance.transition_case(v_case_id, p_return_status, p_failure_reason);

    insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
    values (v_case_id, 'RESTORATION_VERIFICATION_FAILED', v_actor, p_failure_reason,
            jsonb_build_object('restoration_id', p_restoration_id));

    return jsonb_build_object('restoration_id', p_restoration_id, 'case_id', v_case_id, 'result', 'FAILED');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- QC send / decision (§12).
-- ---------------------------------------------------------------------------

create or replace function maintenance.send_to_qc(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_status maintenance.case_status;
  v_clearance_id uuid;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may send a case to QC';
  end if;

  select status into v_status from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if v_status <> 'TECHNICALLY_RESTORED' then
    raise exception 'INVALID_OPERATION: case must be TECHNICALLY_RESTORED to send to QC (current: %)', v_status;
  end if;

  insert into maintenance.clearances (case_id, sent_to_qc_by)
  values (p_case_id, v_actor)
  returning id into v_clearance_id;

  perform maintenance.transition_case(p_case_id, 'CLEARANCE_PENDING');

  return jsonb_build_object('clearance_id', v_clearance_id, 'case_id', p_case_id);
end;
$$;

create or replace function maintenance.qc_decision(
  p_clearance_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_existing_decision text;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may record a QC decision';
  end if;
  if p_decision not in ('CLEARED', 'REJECTED') then
    raise exception 'INVALID_DECISION: must be CLEARED or REJECTED';
  end if;
  if p_decision = 'REJECTED' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'REASON_REQUIRED: a reason is mandatory for QC rejection';
  end if;

  select case_id, decision into v_case_id, v_existing_decision
  from maintenance.clearances where id = p_clearance_id for update;
  if not found then
    raise exception 'CLEARANCE_NOT_FOUND: %', p_clearance_id;
  end if;
  if v_existing_decision <> 'PENDING' then
    raise exception 'ALREADY_DECIDED: clearance % is already %', p_clearance_id, v_existing_decision;
  end if;

  update maintenance.clearances set
    decision = p_decision,
    decision_reason = p_reason,
    decided_at = now()
  where id = p_clearance_id;

  if p_decision = 'CLEARED' then
    perform maintenance.transition_case(v_case_id, 'MAINTENANCE_RELEASED');
  else
    perform maintenance.transition_case(v_case_id, 'QC_REJECTED', p_reason);
  end if;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case_id, 'QC_DECISION', v_actor, p_reason,
          jsonb_build_object('clearance_id', p_clearance_id, 'decision', p_decision));

  return jsonb_build_object('clearance_id', p_clearance_id, 'case_id', v_case_id, 'decision', p_decision);
end;
$$;
