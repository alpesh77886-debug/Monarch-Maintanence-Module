-- MONARCH Maintenance — Loop 105 hotfix: `transition_case` regression from
-- migration 0052.
--
-- Root cause: 0052 (Loop 103, RISK-33 "no unilateral closure" guard) wrote
-- its `create or replace function maintenance.transition_case(...)` body by
-- copying migration 0007's version and adding the new dispute guard on top
-- of it. But `transition_case` had already been redefined TWICE since 0007
-- — by 0019 (§14.2 PTW gate) and, most recently, by 0034 (the QC-authority
-- identity's narrow CLEARANCE_PENDING-only transition grant, F-01/F-01b,
-- plus the DUPLICATE -> USE_MARK_DUPLICATE_CASE redirect and the refined
-- "qc_required is true or undecided" QC gate wording). Copying from the
-- stale 0007 base silently reverted every one of those, live, on this
-- module's actual Supabase project — caught by CI, not by review, because
-- this sandbox cannot run the suite locally against the live project.
--
-- Confirmed via a deterministic (not flaked — reproduced identically on a
-- re-run) 13-test failure spanning `forensic-authorization.test.ts`,
-- `priority-and-ptw.test.ts`, `duplicate-and-false-complaint.test.ts`,
-- `qc-and-restoration.test.ts`, and this batch's own
-- `restoration-dispute.test.ts`. Every failure traces to the exact
-- capability 0034/0019 added and 0052 dropped.
--
-- Fix: re-apply 0034's full body verbatim (PTW gate, QC-authority narrow
-- grant, DUPLICATE redirect, refined QC gate wording — all restored
-- unchanged) with ONLY the RISK-33 "no unilateral closure" guard from 0052
-- layered on top, in the same place it was before. No other behavior
-- changes.

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
  v_ptw_required boolean;
  v_ptw_proof_ref text;
  v_cached jsonb;
  v_event_id uuid;
  v_actor uuid := auth.uid();
  v_is_staff boolean := maintenance.is_staff();
  v_is_qc boolean := maintenance.is_qc_authority();
begin
  -- Staff may attempt any transition (the graph and the gates below still
  -- apply). A QC identity may only attempt the two QC-decision outcomes; the
  -- CLEARANCE_PENDING precondition is enforced after the status is read.
  if not v_is_staff
     and not (v_is_qc and p_new_status in ('MAINTENANCE_RELEASED', 'QC_REJECTED')) then
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

  select status, qc_required, ptw_required, ptw_proof_ref
    into v_current, v_qc_required, v_ptw_required, v_ptw_proof_ref
  from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  -- The QC identity's narrow grant, completed now that the status is known:
  -- it may only decide a case that is genuinely awaiting a QC decision. A QC
  -- identity can never, for example, release a TECHNICALLY_RESTORED case
  -- directly and skip the clearance record.
  if not v_is_staff and v_current <> 'CLEARANCE_PENDING' then
    raise exception 'FORBIDDEN: a QC identity may only decide a case that is CLEARANCE_PENDING (current: %)', v_current;
  end if;

  if not exists (
    select 1 from maintenance.status_transitions
    where from_status = v_current and to_status = p_new_status
  ) then
    raise exception 'INVALID_TRANSITION: % -> % is not permitted', v_current, p_new_status;
  end if;

  -- §13 QC gate (Loop 5, hardened for RISK-11): blocks the DIRECT
  -- TECHNICALLY_RESTORED -> MAINTENANCE_RELEASED edge whenever qc_required
  -- is true OR undecided (NULL) — only an explicit false allows it. The
  -- CLEARANCE_PENDING -> MAINTENANCE_RELEASED edge (only reachable via
  -- qc_decision(CLEARED)) is intentionally not blocked here.
  if p_new_status = 'MAINTENANCE_RELEASED' and v_current = 'TECHNICALLY_RESTORED'
     and v_qc_required is distinct from false then
    raise exception 'QC_GATE: qc_required is true or undecided — use send_to_qc / qc_decision(CLEARED), not a direct transition';
  end if;

  -- §14.2 PTW gate (Loop 16): unlike the QC gate, an UNDECIDED ptw_required
  -- does not block — PTW is "applicable capabilities", not mandatory on
  -- every case, and only an explicit true creates the requirement. Once
  -- true, IN_REPAIR (the physical-work boundary) is refused until a proof is
  -- linked.
  if p_new_status = 'IN_REPAIR' and v_current = 'DIAGNOSING'
     and coalesce(v_ptw_required, false) and v_ptw_proof_ref is null then
    raise exception 'PTW_GATE: PTW is required and no proof is linked — call link_ptw_proof before starting repair work (§14.2)';
  end if;

  -- RISK-33 / §11 (migration 0052, Gate 21 Loop 103): "no unilateral
  -- closure" while a complainant's dispute on this case's restoration is
  -- still PENDING. Only guards the two forward-from-verification edges (QC
  -- entry and the no-QC-required direct release) — the DIAGNOSING/IN_REPAIR
  -- backward edges used by a failed verification or a not-fixed dispute
  -- acknowledgement are unaffected, and are how a PENDING dispute normally
  -- gets resolved.
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
  'Generic lifecycle transition RPC. Enforces the locked status_transitions graph, the QC-authority identity''s narrow CLEARANCE_PENDING-only grant (F-01/F-01b, migration 0034), the QC gate boundary (§13, migrations 0007/0034), the PTW gate (§14.2, migrations 0019/0034), the DUPLICATE redirect, and the RISK-33 "no unilateral closure" rule (§11, migration 0052, corrected here in 0053 after it was accidentally dropped).';
