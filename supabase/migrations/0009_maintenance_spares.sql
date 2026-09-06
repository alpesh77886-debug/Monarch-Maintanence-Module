-- MONARCH Maintenance — Loop 8: spare request/usage RPCs (§16).
--
-- The `spare_requests`/`spare_usage` tables and their §3.3 columns
-- (requires_manager_approval, approval_proof_ref, approved_by/_at) have
-- existed since Loop 1, but their insert policies (0002) let ANY
-- authenticated user insert a row with arbitrary values for those columns —
-- including `requires_manager_approval = false` on a >₹12,000 request, or a
-- self-set `approved_by`/`approved_at` with no real Manager action. That is
-- a server-side-enforcement gap on a locked financial-authority boundary
-- (CLAUDE.md: "every material state change must be testable and
-- auditable — server-side enforced, never UI-only"). This migration closes
-- it the same way every other financially/audit-sensitive table in this
-- schema is handled: RPC-only writes, threshold computed server-side.

drop policy if exists spare_requests_insert on maintenance.spare_requests;

create policy spare_requests_insert on maintenance.spare_requests
  for insert to authenticated
  with check (false); -- raise_spare_request below is the only way in

drop policy if exists spare_usage_insert on maintenance.spare_usage;

create policy spare_usage_insert on maintenance.spare_usage
  for insert to authenticated
  with check (false); -- record_spare_usage below is the only way in

-- ---------------------------------------------------------------------------
-- Raise a spare request (§16.1, §16.3). Any authenticated user may call this
-- directly — §16.3 explicitly allows "Technician can raise spare requirement
-- directly, OR inform Executive and have Executive raise it" and Maintenance
-- staff are not the only people who touch a case (reporters/technicians
-- aren't staff, per §3.1). What is NOT client-controlled: the ₹12,000
-- Manager-authority threshold (§3.3) — `requires_manager_approval` is always
-- computed here from `p_estimated_amount`, never accepted as input.
-- ---------------------------------------------------------------------------

create or replace function maintenance.raise_spare_request(
  p_case_id uuid,
  p_spare_name text,
  p_quantity_requested numeric,
  p_estimated_amount numeric default null,
  p_intervention_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid;
  v_requires_approval boolean;
  v_initiated_role text;
begin
  if p_spare_name is null or length(trim(p_spare_name)) = 0 then
    raise exception 'SPARE_NAME_REQUIRED: a spare name/description is mandatory';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  -- §3.3: basis is Total Budget / Invoice Total Amount, boundary is exactly
  -- ₹12,000 (not the older ₹10,000 figure). No amount given -> treated as
  -- not yet priced, so it cannot trigger the Manager-authority gate; the
  -- gate re-evaluates once a real amount is known (nothing here forces one
  -- to be supplied at request time, since it may not be known yet).
  v_requires_approval := coalesce(p_estimated_amount, 0) > 12000;
  v_initiated_role := case when maintenance.is_staff() then 'EXECUTIVE' else 'TECHNICIAN' end;

  insert into maintenance.spare_requests (
    case_id, intervention_id, spare_name, quantity_requested, initiated_by,
    initiated_role, estimated_amount, requires_manager_approval
  ) values (
    p_case_id, p_intervention_id, p_spare_name, p_quantity_requested, v_actor,
    v_initiated_role, p_estimated_amount, v_requires_approval
  ) returning id into v_request_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
  values (
    p_case_id, 'SPARE_REQUESTED', v_actor,
    jsonb_build_object(
      'spare_request_id', v_request_id, 'spare_name', p_spare_name,
      'quantity_requested', p_quantity_requested, 'estimated_amount', p_estimated_amount,
      'requires_manager_approval', v_requires_approval
    )
  );

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'raise_spare_request', 'maintenance.spare_requests', v_request_id,
          jsonb_build_object('case_id', p_case_id, 'requires_manager_approval', v_requires_approval));

  return jsonb_build_object(
    'spare_request_id', v_request_id, 'case_id', p_case_id,
    'requires_manager_approval', v_requires_approval
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Manager approval for a >₹12,000 request (§3.3). Approval proof is a
-- mandatory REQUEST prerequisite (not a whole-case closure blocker) — it is
-- enforced here and again at usage time in record_spare_usage below.
-- ---------------------------------------------------------------------------

create or replace function maintenance.approve_spare_request(
  p_spare_request_id uuid,
  p_approval_proof_ref text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_requires_approval boolean;
  v_approved_at timestamptz;
begin
  if not maintenance.is_manager() then
    raise exception 'FORBIDDEN: only Maintenance Manager may approve a spare request (§3.3, >₹12,000)';
  end if;
  if p_approval_proof_ref is null or length(trim(p_approval_proof_ref)) = 0 then
    raise exception 'APPROVAL_PROOF_REQUIRED: approval proof is mandatory before a high-value spare request can proceed';
  end if;

  select case_id, requires_manager_approval, approved_at
  into v_case_id, v_requires_approval, v_approved_at
  from maintenance.spare_requests where id = p_spare_request_id for update;
  if not found then
    raise exception 'SPARE_REQUEST_NOT_FOUND: %', p_spare_request_id;
  end if;
  if not v_requires_approval then
    raise exception 'NOT_REQUIRED: this spare request is within Executive authority (<=₹12,000) and needs no Manager approval';
  end if;
  if v_approved_at is not null then
    raise exception 'ALREADY_APPROVED: spare request % was already approved', p_spare_request_id;
  end if;

  update maintenance.spare_requests set
    approved_by = v_actor,
    approved_at = now(),
    approval_proof_ref = p_approval_proof_ref
  where id = p_spare_request_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
  values (v_case_id, 'SPARE_REQUEST_APPROVED', v_actor,
          jsonb_build_object('spare_request_id', p_spare_request_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'approve_spare_request', 'maintenance.spare_requests', p_spare_request_id,
          jsonb_build_object('case_id', v_case_id, 'approval_proof_ref', p_approval_proof_ref));

  return jsonb_build_object('spare_request_id', p_spare_request_id, 'approved', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Record actual spare usage (§16.1 usage chain). Same actor eligibility as
-- record_intervention (0004): staff, or the actively assigned technician on
-- this case. If linked to a request that needed Manager approval, that
-- approval must already be recorded — this is where "approval proof is a
-- request prerequisite" actually gets enforced against real usage.
-- ---------------------------------------------------------------------------

create or replace function maintenance.record_spare_usage(
  p_case_id uuid,
  p_quantity numeric,
  p_spare_request_id uuid default null,
  p_intervention_id uuid default null,
  p_asset_ref text default null,
  p_outcome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_usage_id uuid;
  v_req_case_id uuid;
  v_requires_approval boolean;
  v_approved_at timestamptz;
begin
  if not (
    maintenance.is_staff()
    or exists (
      select 1 from maintenance.case_assignments
      where case_id = p_case_id and technician_user_id = v_actor and is_active
    )
  ) then
    raise exception 'FORBIDDEN: only staff, or an actively assigned technician, may record spare usage';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  if p_spare_request_id is not null then
    select case_id, requires_manager_approval, approved_at
    into v_req_case_id, v_requires_approval, v_approved_at
    from maintenance.spare_requests where id = p_spare_request_id;
    if not found then
      raise exception 'SPARE_REQUEST_NOT_FOUND: %', p_spare_request_id;
    end if;
    if v_req_case_id <> p_case_id then
      raise exception 'CASE_MISMATCH: spare request % belongs to a different case', p_spare_request_id;
    end if;
    if v_requires_approval and v_approved_at is null then
      raise exception 'APPROVAL_REQUIRED: this spare request exceeds ₹12,000 and needs Manager approval before usage can be recorded';
    end if;
  end if;

  insert into maintenance.spare_usage (
    spare_request_id, case_id, intervention_id, asset_ref, actor_user_id, quantity, outcome
  ) values (
    p_spare_request_id, p_case_id, p_intervention_id, p_asset_ref, v_actor, p_quantity, p_outcome
  ) returning id into v_usage_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
  values (
    p_case_id, 'SPARE_USED', v_actor,
    jsonb_build_object('spare_usage_id', v_usage_id, 'spare_request_id', p_spare_request_id, 'quantity', p_quantity)
  );

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'record_spare_usage', 'maintenance.spare_usage', v_usage_id,
          jsonb_build_object('case_id', p_case_id, 'quantity', p_quantity));

  return jsonb_build_object('spare_usage_id', v_usage_id, 'case_id', p_case_id);
end;
$$;
