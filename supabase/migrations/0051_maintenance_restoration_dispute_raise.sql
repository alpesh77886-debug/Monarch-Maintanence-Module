-- MONARCH Maintenance — Loop 102: RISK-33 (MEDIUM) — complainant
-- disagreement path, part 1 (schema + raise side).
--
-- IMPLEMENTATION_PACK.md §11 (LOCKED): "If Executive believes work is
-- technically complete but complainant reports machine still not okay:
-- complainant + Executive jointly decide - no unilateral closure - record
-- decision, actors, timestamp, and evidence/history." Flagged as RISK-33
-- since Gate 12 with zero implementation anywhere in the schema.
--
-- Boss decision (explicit, Gate 21/Loop 101): the interaction is
-- complainant-initiated, Executive-acknowledged — "Yaha samne se request
-- aayegi user ki ke Kaam nahi huva tab Executive usko acknowledge karega
-- ke huva ya nahi huva" (a request comes from the complainant that the
-- work is not done; the Executive then acknowledges whether it is done or
-- not). This migration is the raise side; migration 0052 (Loop 103) adds
-- the Executive's acknowledge side plus the "no unilateral closure" guard
-- that gives the rule real server-side teeth.
--
-- Scope, deliberately narrow and pack-faithful: §11 sits between §10
-- (restoration) and §12 (QC gate) — this is the verification-time
-- disagreement, not a general "reopen after closure" mechanism (that is
-- RISK-32/reopen_case, already Manager-gated). So a dispute can only be
-- raised against a TECHNICAL restoration whose own staff-side verification
-- already PASSED, while the case is still at TECHNICALLY_RESTORED — before
-- QC/closure, exactly where §11 places it. This also means the "return to
-- DIAGNOSING/IN_REPAIR on not-fixed" resolution (0052) reuses the existing
-- TECHNICALLY_RESTORED -> {DIAGNOSING, IN_REPAIR} graph edges already in
-- the locked lifecycle graph (§4.2) — no new edge is invented.
--
-- This is the ONE business RPC in the schema where the authorized caller
-- is deliberately NOT is_staff() — the complainant (the case's own
-- reporter_user_id) is the authorized actor, matching the pack's own
-- framing ("complainant + Executive jointly decide").

create table maintenance.restoration_disputes (
  id uuid primary key default gen_random_uuid(),
  restoration_id uuid not null references maintenance.restorations(id),
  case_id uuid not null references maintenance.cases(id),
  raised_by uuid not null references auth.users(id),
  raised_reason text not null,
  raised_at timestamptz not null default now(),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACKNOWLEDGED_FIXED', 'ACKNOWLEDGED_NOT_FIXED')),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  acknowledgement_reason text
);

comment on table maintenance.restoration_disputes is
  'RISK-33 (Gate 21, Loops 102-103): complainant disagreement path, IMPLEMENTATION_PACK.md §11. RPC-only (raise_restoration_dispute / acknowledge_restoration_dispute) — never written to directly, matching the clearances/spare_requests precedent for financially/audit-sensitive tables (migration 0024).';

create index restoration_disputes_case_id_idx on maintenance.restoration_disputes (case_id);
create index restoration_disputes_restoration_id_idx on maintenance.restoration_disputes (restoration_id);
create index restoration_disputes_pending_idx on maintenance.restoration_disputes (restoration_id) where status = 'PENDING';

alter table maintenance.restoration_disputes enable row level security;

-- Read: the complainant who raised it, or any Maintenance staff (same
-- pattern as every other case-scoped table — staff need full visibility,
-- the reporter needs to see their own dispute's outcome).
create policy restoration_disputes_select on maintenance.restoration_disputes
  for select to authenticated
  using (maintenance.is_staff() or raised_by = auth.uid());

-- Write: RPC-only. raise_restoration_dispute / acknowledge_restoration_dispute
-- are SECURITY DEFINER and are the only way in — this closes the same class
-- of direct-insert bypass migration 0024 closed for clearances.
create policy restoration_disputes_insert on maintenance.restoration_disputes
  for insert to authenticated
  with check (false);

create policy restoration_disputes_update on maintenance.restoration_disputes
  for update to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Notification type for the dispute-raised alert (§11 "record decision,
-- actors, timestamp" implies the Executive must actually be told).
-- ---------------------------------------------------------------------------

alter table maintenance.notifications
  drop constraint if exists notifications_notification_type_check;

alter table maintenance.notifications
  add constraint notifications_notification_type_check check (notification_type in (
    'CASE_ACKNOWLEDGED',
    'WAIT_RESUME_READY',
    'WAIT_ESCALATION_24H',
    'WAIT_MANAGER_REMINDER_24H',
    'EMERGENCY_ESCALATION_1H',
    'PM_OVERDUE',
    'CASE_HANDOVER_RECEIVED',
    'CASE_UNASSIGNED',
    'PRODUCTION_BOUNDARY_BREACH',
    'RECURRENCE_SUSPECTED',
    'CAPA_ASSIGNED',
    'SAFETY_STOP_RAISED',
    'RESTORATION_DISPUTED'
  ));

-- ---------------------------------------------------------------------------
-- raise_restoration_dispute — the complainant's side.
-- ---------------------------------------------------------------------------

create or replace function maintenance.raise_restoration_dispute(
  p_restoration_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_case_number text;
  v_case_status maintenance.case_status;
  v_reporter_user_id uuid;
  v_owner uuid;
  v_restoration_type text;
  v_verification_result text;
  v_dispute_id uuid;
  v_manager record;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: a reason is mandatory to dispute a restoration';
  end if;

  select r.case_id, r.restoration_type, r.verification_result,
         c.case_number, c.status, c.reporter_user_id, c.current_owner_user_id
  into v_case_id, v_restoration_type, v_verification_result,
       v_case_number, v_case_status, v_reporter_user_id, v_owner
  from maintenance.restorations r
  join maintenance.cases c on c.id = r.case_id
  where r.id = p_restoration_id
  for update of r;
  if not found then
    raise exception 'RESTORATION_NOT_FOUND: %', p_restoration_id;
  end if;

  -- Deliberately NOT is_staff() — the complainant is the authorized caller
  -- here (§11: "complainant + Executive jointly decide").
  if v_reporter_user_id <> v_actor then
    raise exception 'FORBIDDEN: only the case''s own reporter may dispute its restoration';
  end if;
  if v_restoration_type <> 'TECHNICAL' then
    raise exception 'INVALID_OPERATION: only a TECHNICAL restoration can be disputed';
  end if;
  if v_verification_result is distinct from 'PASSED' then
    raise exception 'INVALID_OPERATION: only a restoration already verified PASSED by staff can be disputed';
  end if;
  if v_case_status <> 'TECHNICALLY_RESTORED' then
    raise exception 'INVALID_OPERATION: case must still be TECHNICALLY_RESTORED to dispute (current: %)', v_case_status;
  end if;
  if exists (
    select 1 from maintenance.restoration_disputes
    where restoration_id = p_restoration_id and status = 'PENDING'
  ) then
    raise exception 'DISPUTE_ALREADY_PENDING: this restoration already has a pending dispute';
  end if;

  insert into maintenance.restoration_disputes (restoration_id, case_id, raised_by, raised_reason)
  values (p_restoration_id, v_case_id, v_actor, p_reason)
  returning id into v_dispute_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case_id, 'RESTORATION_DISPUTED', v_actor, p_reason,
          jsonb_build_object('restoration_id', p_restoration_id, 'dispute_id', v_dispute_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'raise_restoration_dispute', 'maintenance.restoration_disputes', v_dispute_id,
          jsonb_build_object('case_id', v_case_id, 'restoration_id', p_restoration_id), p_reason);

  -- Notify the case's current owner (the Executive whose "technically
  -- complete" claim is under dispute) if the case has one; otherwise every
  -- active Manager, the same substitute-recipient pattern already used for
  -- SAFETY_STOP_RAISED (migration 0030) and production-boundary breaches
  -- (migration 0015) when there is no single obvious individual recipient.
  if v_owner is not null then
    insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
    values (v_owner, v_case_id, 'RESTORATION_DISPUTED',
            format('Complainant disputes restoration on case %s: %s', v_case_number, p_reason));
  else
    for v_manager in select id from maintenance.staff where role = 'MAINTENANCE_MANAGER' and is_active loop
      insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
      values (v_manager.id, v_case_id, 'RESTORATION_DISPUTED',
              format('Complainant disputes restoration on case %s (no owner assigned): %s', v_case_number, p_reason));
    end loop;
  end if;

  return jsonb_build_object('dispute_id', v_dispute_id, 'case_id', v_case_id,
                             'restoration_id', p_restoration_id, 'status', 'PENDING');
end;
$$;

comment on function maintenance.raise_restoration_dispute(uuid, text) is
  'RISK-33 (Gate 21, Loop 102): the case reporter disputes a TECHNICAL restoration staff already verified PASSED. IMPLEMENTATION_PACK.md §11. See maintenance.acknowledge_restoration_dispute (migration 0052) for the Executive-side resolution.';
