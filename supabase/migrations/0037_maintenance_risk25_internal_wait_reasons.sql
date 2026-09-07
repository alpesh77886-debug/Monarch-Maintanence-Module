-- ---------------------------------------------------------------------------
-- RISK-25 CLOSED — the three INTERNAL waiting reasons.
--
-- RISK-25 was raised in Loop 37 and deliberately left OPEN: an INTERNAL wait
-- could never escalate, and closing it required knowing when an INTERNAL
-- wait's 24h clock starts — a threshold the pack never stated. Guessing it
-- was forbidden by §19.15.
--
-- The Boss has now supplied that evidence. There are EXACTLY THREE permitted
-- INTERNAL reasons and no fourth category:
--
--   REPORTING_MANAGER_APPROVAL_PENDING
--     The Maintenance Manager is waiting on the authority they report to.
--     That approval is required before Purchase can proceed with the PO.
--     Never auto-marked as received.
--
--   PURCHASE_ORDER_RELEASE_PENDING
--     The approval has arrived; Purchase has not yet released the PO.
--     Never auto-marked as released.
--
--   OTHER
--     Any other legitimate INTERNAL dependency. Meaningful detail is
--     mandatory — the system must not silently absorb a hidden fourth
--     category into "Other".
--
-- PURCHASE AUTHORITY BOUNDARY: Maintenance records its dependency and its
-- escalation state, nothing else. It never creates a Purchase Order, releases
-- one, fabricates an approval, or mutates Purchase-system truth — the same
-- boundary already enforced for Production and QC.
--
-- Enforced in three places so it is not UI-only:
--   * frontend offers exactly three choices (waiting-form.tsx)
--   * enter_waiting rejects anything else, and rejects a bare "Other"
--   * a table CHECK constraint refuses a bad row even on a direct insert
-- ---------------------------------------------------------------------------

alter table maintenance.waits
  add column if not exists internal_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'waits_internal_reason_check') then
    alter table maintenance.waits add constraint waits_internal_reason_check check (
      (reason_type = 'INTERNAL' and internal_reason in
         ('REPORTING_MANAGER_APPROVAL_PENDING','PURCHASE_ORDER_RELEASE_PENDING','OTHER'))
      or (reason_type <> 'INTERNAL' and internal_reason is null)
    );
  end if;
end $$;

comment on column maintenance.waits.internal_reason is
  'RISK-25 (Boss-supplied evidence): exactly three INTERNAL dependency reasons, no fourth category. Maintenance records the dependency only — it never creates, releases or fabricates a Purchase Order or an approval.';

create or replace function maintenance.enter_waiting(
  p_case_id uuid,
  p_reason_type text,
  p_reason_text text,
  p_dependency_ref text default null,
  p_expected_resolution_info text default null,
  p_internal_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_wait_id uuid;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may put a case into WAITING';
  end if;
  if p_reason_type not in ('INTERNAL', 'EXTERNAL') then
    raise exception 'REASON_TYPE_REQUIRED: reason_type must be explicitly INTERNAL or EXTERNAL, got %', p_reason_type;
  end if;
  if p_reason_text is null or length(trim(p_reason_text)) = 0 then
    raise exception 'REASON_TEXT_REQUIRED: a free-text reason is mandatory';
  end if;

  if p_reason_type = 'INTERNAL' then
    if p_internal_reason is null then
      raise exception 'INTERNAL_REASON_REQUIRED: an INTERNAL wait must state which of the three reasons applies';
    end if;
    if p_internal_reason not in
       ('REPORTING_MANAGER_APPROVAL_PENDING','PURCHASE_ORDER_RELEASE_PENDING','OTHER') then
      raise exception 'INVALID_INTERNAL_REASON: % is not one of the three permitted INTERNAL reasons', p_internal_reason;
    end if;
    -- "Other" must carry real detail, or it becomes the hidden fourth category.
    if p_internal_reason = 'OTHER' and length(trim(coalesce(p_reason_text,''))) < 10 then
      raise exception 'DETAIL_REQUIRED: INTERNAL reason OTHER requires meaningful detail, not a placeholder';
    end if;
  elsif p_internal_reason is not null then
    raise exception 'INVALID_INTERNAL_REASON: internal_reason applies only to an INTERNAL wait';
  end if;

  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;
  if exists (select 1 from maintenance.waits where case_id = p_case_id and resumed_at is null) then
    raise exception 'ALREADY_WAITING: case % already has an open WAITING entry', p_case_id;
  end if;

  insert into maintenance.waits (
    case_id, reason_type, reason_text, owner_user_id, dependency_ref,
    expected_resolution_info, internal_reason
  ) values (
    p_case_id, p_reason_type, p_reason_text, v_actor, p_dependency_ref,
    p_expected_resolution_info, p_internal_reason
  ) returning id into v_wait_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'WAITING_ENTERED', v_actor, p_reason_text,
          jsonb_build_object('wait_id', v_wait_id, 'reason_type', p_reason_type,
                             'internal_reason', p_internal_reason));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'enter_waiting', 'maintenance.waits', v_wait_id,
          jsonb_build_object('case_id', p_case_id, 'reason_type', p_reason_type,
                             'internal_reason', p_internal_reason), p_reason_text);

  return jsonb_build_object('wait_id', v_wait_id, 'case_id', p_case_id,
                            'internal_reason', p_internal_reason);
end;
$$;

-- Adding p_internal_reason changed the arity, so `create or replace` above did
-- NOT replace the old function — it created a SECOND overload. The 5-argument
-- version has no INTERNAL-reason enforcement, so leaving it would be a bypass
-- of the very rule this migration enforces, and it also made 3-argument calls
-- ambiguous. Caught by the live verification probe, not by CI.
--
-- The CHECK constraint would still have refused the resulting row, so it failed
-- closed rather than open — but a second door that is merely locked is still a
-- second door.
drop function if exists maintenance.enter_waiting(uuid, text, text, text, text);
