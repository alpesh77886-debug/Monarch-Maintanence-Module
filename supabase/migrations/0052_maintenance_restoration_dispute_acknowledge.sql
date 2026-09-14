-- MONARCH Maintenance — Loop 103: RISK-33 (MEDIUM) — complainant
-- disagreement path, part 2 (acknowledge side + "no unilateral closure").
--
-- Completes the mechanism migration 0051 started. IMPLEMENTATION_PACK.md
-- §11 (LOCKED): "complainant + Executive jointly decide - no unilateral
-- closure - record decision, actors, timestamp, and evidence/history."
--
-- Two things land here:
--   1. acknowledge_restoration_dispute — the Executive's side. Staff
--      (is_staff()) reviews a PENDING dispute and records whether the
--      restoration is actually fixed or not, per the Boss's own framing
--      ("Executive usko acknowledge karega ke huva ya nahi huva").
--   2. The actual "no unilateral closure" enforcement: transition_case is
--      extended to refuse TECHNICALLY_RESTORED -> {CLEARANCE_PENDING,
--      MAINTENANCE_RELEASED} while a PENDING dispute exists against the
--      case. Without this, a raised dispute would be purely advisory — an
--      Executive could still push the case straight through QC/closure
--      while the complainant's dispute sat unresolved, which is exactly
--      what §11 forbids. This is the one place this rule gets real
--      server-side teeth, matching the existing pattern of transition_case
--      being where the QC gate boundary (§13, migration 0007) is enforced.

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

  if p_new_status = 'MAINTENANCE_RELEASED' and v_current = 'TECHNICALLY_RESTORED'
     and coalesce(v_qc_required, false) then
    raise exception 'QC_GATE: qc_required is true — use send_to_qc / qc_decision(CLEARED), not a direct transition';
  end if;

  -- RISK-33 / §11: "no unilateral closure" while a complainant's dispute
  -- on this case's restoration is still PENDING. Only guards the two
  -- forward-from-verification edges (QC entry and the no-QC-required
  -- direct release) — the DIAGNOSING/IN_REPAIR backward edges used by a
  -- failed verification or a not-fixed dispute acknowledgement are
  -- unaffected, and are how a PENDING dispute normally gets resolved.
  if v_current = 'TECHNICALLY_RESTORED' and p_new_status in ('CLEARANCE_PENDING', 'MAINTENANCE_RELEASED')
     and exists (select 1 from maintenance.restoration_disputes where case_id = p_case_id and status = 'PENDING') then
    raise exception 'DISPUTE_PENDING: a complainant restoration dispute is pending on this case — acknowledge it first (§11)';
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

comment on function maintenance.transition_case(uuid, maintenance.case_status, text, text, text) is
  'Generic lifecycle transition RPC. Enforces the locked status_transitions graph, the QC gate boundary (§13, migration 0007), and — as of migration 0052 — the RISK-33 "no unilateral closure" rule (§11): TECHNICALLY_RESTORED cannot advance to CLEARANCE_PENDING/MAINTENANCE_RELEASED while a restoration_disputes row is PENDING.';

-- ---------------------------------------------------------------------------
-- acknowledge_restoration_dispute — the Executive's side.
-- ---------------------------------------------------------------------------

create or replace function maintenance.acknowledge_restoration_dispute(
  p_dispute_id uuid,
  p_fixed boolean,
  p_reason text,
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
  v_raised_by uuid;
  v_case_number text;
  v_existing_status text;
  v_new_status text;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may acknowledge a restoration dispute';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: acknowledging a dispute requires a reason';
  end if;

  select d.case_id, d.raised_by, d.status, c.case_number
  into v_case_id, v_raised_by, v_existing_status, v_case_number
  from maintenance.restoration_disputes d
  join maintenance.cases c on c.id = d.case_id
  where d.id = p_dispute_id
  for update of d;
  if not found then
    raise exception 'DISPUTE_NOT_FOUND: %', p_dispute_id;
  end if;
  if v_existing_status <> 'PENDING' then
    raise exception 'ALREADY_ACKNOWLEDGED: dispute % is already %', p_dispute_id, v_existing_status;
  end if;

  v_new_status := case when p_fixed then 'ACKNOWLEDGED_FIXED' else 'ACKNOWLEDGED_NOT_FIXED' end;

  update maintenance.restoration_disputes set
    status = v_new_status,
    acknowledged_by = v_actor,
    acknowledged_at = now(),
    acknowledgement_reason = p_reason
  where id = p_dispute_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case_id, 'RESTORATION_DISPUTE_ACKNOWLEDGED', v_actor, p_reason,
          jsonb_build_object('dispute_id', p_dispute_id, 'resolution', v_new_status));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, before, after, reason)
  values (v_actor, 'acknowledge_restoration_dispute', 'maintenance.restoration_disputes', p_dispute_id,
          jsonb_build_object('status', 'PENDING'), jsonb_build_object('status', v_new_status), p_reason);

  if not p_fixed then
    if p_return_status not in ('DIAGNOSING', 'IN_REPAIR') then
      raise exception 'INVALID_RETURN_STATUS: must be DIAGNOSING or IN_REPAIR, got %', p_return_status;
    end if;
    -- Reuses the existing TECHNICALLY_RESTORED -> {DIAGNOSING, IN_REPAIR}
    -- graph edges (§4.2) — the same path verify_restoration's own failure
    -- branch already uses. No new lifecycle edge is introduced.
    perform maintenance.transition_case(v_case_id, p_return_status, p_reason);
  end if;
  -- p_fixed = true: the Executive's original TECHNICALLY_RESTORED claim
  -- stands, so the case status is left exactly as it is — the dispute
  -- moving off PENDING is what lifts the transition_case "no unilateral
  -- closure" guard (migration 0052) and lets the case proceed to QC/closure.

  -- Tell the complainant what was decided — §11 "record decision, actors,
  -- timestamp" implies they are told the outcome, not left to guess.
  insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
  values (v_raised_by, v_case_id, 'RESTORATION_DISPUTED',
          format('Case %s: your dispute was reviewed — %s. %s', v_case_number,
                 case when p_fixed then 'confirmed fixed' else 'confirmed not fixed, work reopened' end, p_reason));

  return jsonb_build_object('dispute_id', p_dispute_id, 'case_id', v_case_id, 'status', v_new_status);
end;
$$;

comment on function maintenance.acknowledge_restoration_dispute(uuid, boolean, text, maintenance.case_status) is
  'RISK-33 (Gate 21, Loop 103): the Executive/staff side of §11''s complainant disagreement path. See maintenance.raise_restoration_dispute (migration 0051) for the complainant''s side.';
