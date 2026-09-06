-- MONARCH Maintenance — fix a regression introduced by Loop 9's
-- transition_case rewrite (0011): it was based on a stale copy of the
-- function (from the original 0003 migration file) that predates BOTH the
-- §13 QC gate added in Loop 5 (0007) AND its RISK-11 NULL-safety fix (which
-- was applied live but never captured in a numbered migration file in this
-- repo — a pre-existing documentation gap that made it easy to miss). The
-- 0011 rewrite silently dropped the QC gate entirely. Caught by CI:
-- qc-and-restoration.test.ts's two QC-gate tests failed on PR #5.
--
-- This restores the QC gate (with the RISK-11 NULL-safe form) together with
-- Loop 9's DUPLICATE guard, in one function. Applied live and re-verified
-- before this file was written — see CHANGELOG.md.

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

  if p_new_status = 'DUPLICATE' then
    raise exception 'USE_MARK_DUPLICATE_CASE: call mark_duplicate_case(...) instead — §4.6 requires linking the primary case, which this generic transition cannot record';
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

  -- §13 QC gate (Loop 5, hardened for RISK-11): blocks the DIRECT
  -- TECHNICALLY_RESTORED -> MAINTENANCE_RELEASED edge whenever qc_required
  -- is true OR undecided (NULL) — only an explicit false allows it. The
  -- CLEARANCE_PENDING -> MAINTENANCE_RELEASED edge (only reachable via
  -- qc_decision(CLEARED)) is intentionally not blocked here.
  if p_new_status = 'MAINTENANCE_RELEASED' and v_current = 'TECHNICALLY_RESTORED'
     and v_qc_required is distinct from false then
    raise exception 'QC_GATE: qc_required is true or undecided — use send_to_qc / qc_decision(CLEARED), not a direct transition';
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
