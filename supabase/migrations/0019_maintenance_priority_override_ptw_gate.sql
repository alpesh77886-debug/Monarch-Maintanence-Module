-- MONARCH Maintenance — Loop 16: priority Manager-override (§5.4) +
-- LOTO/PTW safety gate seam (§14, §32 item 19).
--
-- Two real gaps found by re-reading §5 and §14 against the live schema:
--
-- §5.4 "Executive can change priority. Manager has final override." Priority
-- was only ever set once, at acknowledge_case, with no RPC to change it
-- afterwards and no override semantics at all.
--
-- §14.2 "PTW Required = Yes/No, required permit/proof linked where
-- applicable, formally required proof must exist before governed work
-- starts." `cases.ptw_required` / `ptw_proof_ref` have existed since the
-- Loop 1 schema but nothing ever wrote to them or gated on them — two dead
-- columns, not a built feature. §32 item 19 asks for "LOTO/PTW safety gate
-- seams without invented authority": the exact issuer/performer/permit
-- authority/authorized-person matrix stays PENDING-01 and is NOT touched
-- here. What §14.2 DOES lock — Required Y/N, a linked proof, and refusing to
-- let governed work start without it when required — is not PENDING, so it
-- is built.
--
-- "Governed work starts" is read as DIAGNOSING -> IN_REPAIR: per §4 it is the
-- only outgoing edge from DIAGNOSING, and it is where physical intervention
-- begins (§9 splits diagnosis from intervention specifically along this
-- line). This is the same reasoning the §13 QC gate uses for its own
-- boundary (TECHNICALLY_RESTORED -> MAINTENANCE_RELEASED).
--
-- transition_case is touched a third time here (after the RISK-14 regression
-- and its 0012 fix). Per the standing process rule from that incident, the
-- base below was copied from `pg_get_functiondef` against the LIVE function,
-- not from this or any other migration file, and only the two new gate
-- blocks were added — nothing else changed. Every existing guard (QC gate at
-- all three qc_required states, the DUPLICATE guard, REASON_REQUIRED,
-- idempotency replay) is re-verified live after this applies, alongside the
-- new PTW gate — see CHANGELOG.md Loop 16.

alter table maintenance.cases
  add column if not exists priority_set_by_role text
    check (priority_set_by_role in ('MAINTENANCE_EXECUTIVE', 'MAINTENANCE_MANAGER'));

create or replace function maintenance.change_priority(
  p_case_id uuid,
  p_priority maintenance.priority,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_priority maintenance.priority;
  v_set_by_role text;
  v_actor_role text;
begin
  if not coalesce(maintenance.is_staff(), false) then
    raise exception 'FORBIDDEN: only Maintenance staff may change priority';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: a reason is mandatory for a priority change';
  end if;

  select priority, priority_set_by_role into v_current_priority, v_set_by_role
  from maintenance.cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  v_actor_role := maintenance.current_staff_role();

  -- §5.4 "Manager has final override": once a Manager has set the priority,
  -- an Executive may not change it again — only another Manager decision
  -- moves it. A never-yet-Manager-touched case (v_set_by_role is null, e.g.
  -- straight from acknowledge_case) is not locked.
  if v_set_by_role = 'MAINTENANCE_MANAGER' and v_actor_role <> 'MAINTENANCE_MANAGER' then
    raise exception 'MANAGER_OVERRIDE: priority was last set by a Maintenance Manager — only a Manager may change it further (§5.4)';
  end if;

  update maintenance.cases
  set priority = p_priority,
      priority_set_by_role = v_actor_role
  where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'PRIORITY_CHANGED', v_actor, p_reason,
          jsonb_build_object('previous_priority', v_current_priority,
                             'new_priority', p_priority,
                             'set_by_role', v_actor_role));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, before, after, reason)
  values (v_actor, 'change_priority', 'maintenance.cases', p_case_id,
          jsonb_build_object('priority', v_current_priority),
          jsonb_build_object('priority', p_priority, 'set_by_role', v_actor_role), p_reason);

  return jsonb_build_object('case_id', p_case_id, 'priority', p_priority, 'set_by_role', v_actor_role);
end;
$$;

-- §14.2: staff-only, and a reason so the decision to require (or not) PTW is
-- itself auditable — this is a record of the call, not the call itself, per
-- §14.1's PENDING authority model.
create or replace function maintenance.set_ptw_required(
  p_case_id uuid,
  p_required boolean,
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
  if not coalesce(maintenance.is_staff(), false) then
    raise exception 'FORBIDDEN: only Maintenance staff may set PTW requirement';
  end if;
  if p_required is null then
    raise exception 'REQUIRED_FLAG_MISSING: PTW required must be explicitly true or false';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: record the basis for this PTW determination';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  -- Turning PTW off clears any proof that was linked against the old
  -- requirement — a stale proof reference for a requirement that no longer
  -- applies is worse than no reference at all.
  update maintenance.cases
  set ptw_required = p_required,
      ptw_proof_ref = case when p_required then ptw_proof_ref else null end
  where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'PTW_REQUIREMENT_SET', v_actor, p_reason,
          jsonb_build_object('ptw_required', p_required));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'set_ptw_required', 'maintenance.cases', p_case_id,
          jsonb_build_object('ptw_required', p_required), p_reason);

  return jsonb_build_object('case_id', p_case_id, 'ptw_required', p_required);
end;
$$;

-- §14.2: "required permit/proof linked where applicable" — a proof cannot be
-- linked against a case where PTW was never marked required, and it cannot be
-- blank (that would satisfy the gate below with nothing behind it).
create or replace function maintenance.link_ptw_proof(
  p_case_id uuid,
  p_proof_ref text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_required boolean;
begin
  if not coalesce(maintenance.is_staff(), false) then
    raise exception 'FORBIDDEN: only Maintenance staff may link PTW proof';
  end if;
  if p_proof_ref is null or length(trim(p_proof_ref)) = 0 then
    raise exception 'PROOF_REF_REQUIRED';
  end if;

  select ptw_required into v_required from maintenance.cases where id = p_case_id;
  if not found then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if not coalesce(v_required, false) then
    raise exception 'PTW_NOT_REQUIRED: this case is not marked as requiring a PTW — call set_ptw_required first';
  end if;

  update maintenance.cases set ptw_proof_ref = p_proof_ref where id = p_case_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'PTW_PROOF_LINKED', v_actor, p_reason,
          jsonb_build_object('ptw_proof_ref', p_proof_ref));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'link_ptw_proof', 'maintenance.cases', p_case_id,
          jsonb_build_object('ptw_proof_ref', p_proof_ref), p_reason);

  return jsonb_build_object('case_id', p_case_id, 'ptw_proof_ref', p_proof_ref);
end;
$$;

-- Base copied verbatim from the LIVE `pg_get_functiondef` output (captured
-- immediately before writing this file — see CHANGELOG.md Loop 16), not from
-- any migration file. Only the PTW_GATE block is new; every other line,
-- comment, and guard is unchanged from what was live.
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

  select status, qc_required, ptw_required, ptw_proof_ref
    into v_current, v_qc_required, v_ptw_required, v_ptw_proof_ref
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
