-- MONARCH Maintenance — Loop 24: §16.2 explicit Stores reference identifiers.
--
-- §16.2 (Responsibility boundary): "Maintenance MUST NOT become a second
-- Stores stock ledger... V1 may record: ... explicit Stores/reference
-- identifiers... When Stores truth is unavailable, use an explicit status
-- such as STORES_REFERENCE_PENDING. Never fabricate stock balances."
--
-- `spare_requests.stores_reference_status` and `spare_usage.
-- stores_reference_status` have existed since Loop 1
-- (`not null default 'STORES_REFERENCE_PENDING'`) — the exact seam the
-- pack describes — alongside a nullable `stores_reference_id` on both. No
-- RPC has ever written to either column: every request/usage row created
-- since Loop 8 sits at the default forever, and `stores_reference_id` stays
-- NULL forever, because nothing could change them. §16.2's "V1 may record
-- ... explicit Stores/reference identifiers" describes a capability that
-- did not exist.
--
-- These columns are deliberately `text`, not a `check`-constrained enum,
-- unlike almost every other status column in this schema
-- (recurrence_flags.status, capa_links.status, etc.) — a real signal, not
-- an oversight, that the exact status vocabulary is Stores' own to define
-- once Phase-3 integration exists, not something to invent here. So these
-- RPCs accept whatever status text a Maintenance staff member is told by
-- Stores, rather than constraining it to a set this migration would have
-- had to make up.
--
-- No is_manager() gate: recording an external reference number is not a
-- ₹12,000-style financial-authority decision (§3.3), it's the same class
-- of plain data entry as spare_usage.asset_ref/outcome — staff-only,
-- matching who already records spare usage.

create or replace function maintenance.set_spare_request_stores_reference(
  p_spare_request_id uuid,
  p_stores_reference_status text,
  p_stores_reference_id text default null,
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
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may update a Stores reference';
  end if;
  if p_stores_reference_status is null or length(trim(p_stores_reference_status)) = 0 then
    raise exception 'STATUS_REQUIRED: a Stores reference status is mandatory';
  end if;

  select case_id into v_case_id from maintenance.spare_requests where id = p_spare_request_id;
  if not found then
    raise exception 'SPARE_REQUEST_NOT_FOUND: %', p_spare_request_id;
  end if;

  update maintenance.spare_requests
  set stores_reference_status = p_stores_reference_status,
      stores_reference_id = p_stores_reference_id
  where id = p_spare_request_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case_id, 'SPARE_REQUEST_STORES_REFERENCE_UPDATED', v_actor, p_reason,
          jsonb_build_object('spare_request_id', p_spare_request_id,
                             'stores_reference_status', p_stores_reference_status,
                             'stores_reference_id', p_stores_reference_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'set_spare_request_stores_reference', 'maintenance.spare_requests', p_spare_request_id,
          jsonb_build_object('stores_reference_status', p_stores_reference_status,
                             'stores_reference_id', p_stores_reference_id), p_reason);

  return jsonb_build_object('spare_request_id', p_spare_request_id,
                             'stores_reference_status', p_stores_reference_status,
                             'stores_reference_id', p_stores_reference_id);
end;
$$;

create or replace function maintenance.set_spare_usage_stores_reference(
  p_spare_usage_id uuid,
  p_stores_reference_status text,
  p_stores_reference_id text default null,
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
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may update a Stores reference';
  end if;
  if p_stores_reference_status is null or length(trim(p_stores_reference_status)) = 0 then
    raise exception 'STATUS_REQUIRED: a Stores reference status is mandatory';
  end if;

  select case_id into v_case_id from maintenance.spare_usage where id = p_spare_usage_id;
  if not found then
    raise exception 'SPARE_USAGE_NOT_FOUND: %', p_spare_usage_id;
  end if;

  update maintenance.spare_usage
  set stores_reference_status = p_stores_reference_status,
      stores_reference_id = p_stores_reference_id
  where id = p_spare_usage_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case_id, 'SPARE_USAGE_STORES_REFERENCE_UPDATED', v_actor, p_reason,
          jsonb_build_object('spare_usage_id', p_spare_usage_id,
                             'stores_reference_status', p_stores_reference_status,
                             'stores_reference_id', p_stores_reference_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'set_spare_usage_stores_reference', 'maintenance.spare_usage', p_spare_usage_id,
          jsonb_build_object('stores_reference_status', p_stores_reference_status,
                             'stores_reference_id', p_stores_reference_id), p_reason);

  return jsonb_build_object('spare_usage_id', p_spare_usage_id,
                             'stores_reference_status', p_stores_reference_status,
                             'stores_reference_id', p_stores_reference_id);
end;
$$;
