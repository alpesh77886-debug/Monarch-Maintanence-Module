-- Loop 29 (RISK-21): record_spare_usage's own §3.3 approval gate (added
-- Loop 8, migration 0009) is entirely conditional on `p_spare_request_id
-- is not null` -- but that parameter defaults to NULL and nothing forced
-- a caller to supply it. Any staff member or actively assigned technician
-- could record spare usage with p_spare_request_id omitted, skipping the
-- >₹12,000 Manager-approval gate completely, with no request and no
-- approval trail at all -- not just via a direct API call, but via this
-- app's own shipped UI (spares-panel.tsx's usage form has an explicit
-- "(not linked to a request)" option as its default).
--
-- This is not merely a financial-authority bypass (§3.3): §16.1 states
-- "Spare usage traceability is mandatory V1" and the usage chain is
-- explicitly "Spare -> Case -> Intervention -> Asset/Machine -> Actor ->
-- Date/Time -> Quantity -> Outcome", starting with "which spare was
-- used." maintenance.spare_usage has NO spare_name column of its own --
-- the only place that identifies which spare was used is
-- spare_requests.spare_name via spare_request_id. An unlinked usage row
-- is therefore not just an unapproved one, it is untraceable to any
-- named spare at all, unconditionally violating §16.1's own "mandatory"
-- requirement -- not merely a PENDING/interpretation matter, so closing
-- this loophole is enforcing an already-locked requirement, not inventing
-- a new one.
--
-- Fix: require p_spare_request_id on every record_spare_usage call. This
-- is the minimal change that satisfies both §16.1 (every usage now names
-- its spare via the linked request) and §3.3 (the >₹12,000 gate can no
-- longer be sidestepped by omitting the link) with a single check.

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

  if p_spare_request_id is null then
    raise exception 'SPARE_REQUEST_REQUIRED: spare usage must reference a spare request (§16.1 traceability, §3.3 financial authority) -- raise one first';
  end if;

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
