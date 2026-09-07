-- ---------------------------------------------------------------------------
-- Two defects introduced by the forensic remediation itself (0031/0032),
-- both caught by CI and root-caused from the actual job log.
--
-- Recorded plainly because the first one exposes a real weakness in how 0031
-- was verified: the four-identity live probe used a NON-EXISTENT clearance id,
-- so it proved the authority gates opened and closed correctly but never
-- exercised the happy path past them. The test suite caught what the probe
-- could not.
-- ---------------------------------------------------------------------------

-- (1) qc_decision could never actually complete.
--
-- qc_decision (0031) correctly lets only a QC-authority identity in, then
-- calls transition_case to move the case. transition_case's own first line is
-- `if not is_staff() then raise FORBIDDEN`, and a QC identity is deliberately
-- NOT staff — so every real QC decision failed with
-- "FORBIDDEN: only Maintenance staff may transition a case".
-- Three CI tests caught it, including the pre-existing Scenario B test.
--
-- The fix is NOT to loosen transition_case generally. A QC identity gets
-- exactly the two transitions that ARE the QC decision, from exactly the one
-- status where a QC decision is meaningful, and nothing else:
--     CLEARANCE_PENDING -> MAINTENANCE_RELEASED   (cleared)
--     CLEARANCE_PENDING -> QC_REJECTED            (rejected)
-- Every other transition remains staff-only. This is not new authority: it is
-- the same authority 0031 already granted, expressed in the one place that
-- actually performs the state change.

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

-- (2) Tightening cases_select silently broke case_assignments_insert.
--
-- The RISK-18 fix (0025) made the emergency self-insert policy require
--   exists (select 1 from cases where id = case_id and emergency_confirmed)
-- That subquery is evaluated AS THE INSERTING USER, so it is itself subject to
-- cases_select. While cases_select was `USING (true)` that was invisible.
-- Once 0032 scoped case reads, a technician who is neither the reporter nor
-- already assigned can no longer SEE the case — so the EXISTS returned false
-- and the legitimate emergency self-insert was refused.
--
-- This is the general hazard: an authorization decision must not depend on the
-- actor's read visibility, or tightening a SELECT policy silently narrows a
-- WITH CHECK policy somewhere else. The check is moved into a SECURITY DEFINER
-- helper so it answers the same question regardless of who is asking.
--
-- Authority is unchanged: the row still only inserts when the case really is a
-- confirmed emergency (RISK-18) and the attribution columns are still pinned
-- (RISK-20). Only the visibility coupling is removed.

create or replace function maintenance.case_is_confirmed_emergency(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = maintenance, public
as $$
  select exists (
    select 1 from maintenance.cases
    where id = p_case_id and emergency_confirmed = true
  );
$$;

comment on function maintenance.case_is_confirmed_emergency(uuid) is
  'RISK-18 gate, decoupled from the caller read visibility that 0032 narrowed. An authorization check must not depend on whether the actor can SELECT the row it is about.';

drop policy if exists case_assignments_insert on maintenance.case_assignments;
create policy case_assignments_insert on maintenance.case_assignments
  for insert to authenticated
  with check (
    emergency_direct_start
    and technician_user_id = auth.uid()
    and assigned_by_user_id is null
    and is_active = true
    and deactivated_at is null
    and maintenance.case_is_confirmed_emergency(case_id)
  );
