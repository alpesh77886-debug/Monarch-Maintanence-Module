-- MONARCH Maintenance — Loop 101: RISK-32 (CRITICAL) — reopen authority.
--
-- IMPLEMENTATION_PACK.md §3.2 (line 150, LOCKED): "Reopen authority =
-- Executive + Manager." reopen_case (migration 0003) has always gated on
-- is_staff() alone, which lets any single Executive OR Manager reopen a
-- CLOSED case unilaterally — flagged as RISK-32 (CRITICAL) since Gate 12
-- and raised unchanged across 9 consecutive gate reports.
--
-- Boss decision (explicit, this loop): "Yaha Sirf Maintenance Manager
-- rakho" — reopen authority is MAINTENANCE_MANAGER only, not a joint
-- Executive+Manager two-step. This is the Boss-supplied resolution of the
-- pack's ambiguous "Executive + Manager" phrase, not an invented rule —
-- per CLAUDE.md, business-rule shape came from the Boss, not from Claude
-- guessing. maintenance.is_manager() already exists (migration 0002/0033)
-- and is reused as-is, not redefined.
--
-- Only the authority check changes. Reason-required, status validation,
-- CLOSED-only precondition, event/audit logging, and the REOPENED ->
-- p_new_status two-step are all unchanged from migration 0003.

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
  if not maintenance.is_manager() then
    raise exception 'FORBIDDEN: only a Maintenance Manager may reopen a closed case';
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

comment on function maintenance.reopen_case(uuid, text, maintenance.case_status) is
  'RISK-32 (Gate 21, Loop 101): reopen authority is MAINTENANCE_MANAGER only (Boss decision), not any staff member. IMPLEMENTATION_PACK.md §3.2 line 150.';
