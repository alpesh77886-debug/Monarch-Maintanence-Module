-- ---------------------------------------------------------------------------
-- F-01 (CRITICAL) — QC decision authority boundary
--
-- Defect being closed: `qc_decision` (0007) guarded only on `is_staff()`, so
-- any MAINTENANCE_EXECUTIVE or MAINTENANCE_MANAGER could set a clearance to
-- CLEARED and drive the case to MAINTENANCE_RELEASED. The whole loop
-- `Maintenance -> send_to_qc -> Maintenance -> CLEARED` was reachable.
--
-- The locked pack forbids this in three separate places:
--   §1   "Maintenance does NOT own ... QC product disposition / clearance truth"
--   §43.8 "QC truth remains QC-owned."
--   §19.15 Claude Code must not "grant QC clearance"
--
-- But it deliberately does NOT name the QC actor:
--   §12  "Exact plant QC permit/authority remains evidence-controlled."
--   §3.1 software roles are MAINTENANCE_EXECUTIVE + MAINTENANCE_MANAGER only
--   §33  V1 must not depend on a live QC API
--
-- So this migration implements the *minimum safe authorization seam* and
-- nothing more: an explicit, EMPTY-BY-DEFAULT allowlist of QC decision
-- identities that is administered out-of-band (service role), exactly the way
-- `maintenance.staff` rows are. It invents no plant SOP, no permit mechanics,
-- no role semantics, and no permission matrix — it is a list of user ids.
--
-- CONSEQUENCE, stated here rather than discovered later: until that list is
-- populated, NO case can be QC-cleared, and cases sent to QC stay in
-- CLEARANCE_PENDING. That is the correct fail-closed behaviour for a control
-- the contract says Maintenance does not own. The QC-NOT-required path
-- (qc_required = false -> TECHNICALLY_RESTORED -> MAINTENANCE_RELEASED) is
-- untouched and still works normally.
-- ---------------------------------------------------------------------------

create table if not exists maintenance.qc_authority (
  user_id     uuid primary key references auth.users(id) on delete restrict,
  granted_by  uuid references auth.users(id),
  granted_at  timestamptz not null default now(),
  is_active   boolean not null default true,
  note        text
);

comment on table maintenance.qc_authority is
  'F-01: explicit allowlist of identities permitted to make the final QC CLEARED/REJECTED decision (§12 — the exact plant QC authority is evidence-controlled, so this table records WHO was granted it, never WHY or under what plant SOP). Empty by default; granted out-of-band by the service role, like maintenance.staff. Membership is never implied by any Maintenance role.';

alter table maintenance.qc_authority enable row level security;

-- Readable by Maintenance staff (so the UI can explain *why* a QC action is
-- unavailable rather than silently hiding it) and by the grantee themselves.
-- No INSERT/UPDATE/DELETE policy exists, deliberately: RLS denies by default,
-- so only the service role can grant or revoke. Same posture as maintenance.staff.
drop policy if exists qc_authority_select on maintenance.qc_authority;
create policy qc_authority_select on maintenance.qc_authority
  for select to authenticated
  using (maintenance.is_staff() or user_id = auth.uid());

create or replace function maintenance.is_qc_authority()
returns boolean
language sql
stable
security definer
set search_path = maintenance, public
as $$
  select exists (
    select 1 from maintenance.qc_authority
    where user_id = auth.uid() and is_active
  );
$$;

comment on function maintenance.is_qc_authority() is
  'True only for an active row in maintenance.qc_authority. Never true by virtue of a Maintenance role.';

-- ---------------------------------------------------------------------------
-- qc_decision — same signature (uuid, text, text) so no overload is created
-- and every existing caller keeps working. Only the authority check and the
-- audit trail change; the decision recording, the state transitions and the
-- rejection-reason rule are byte-for-byte the 0007 behaviour.
-- ---------------------------------------------------------------------------

create or replace function maintenance.qc_decision(
  p_clearance_id uuid,
  p_decision text,
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
  v_existing_decision text;
begin
  -- (1) Maintenance identities are refused FIRST and unconditionally.
  -- This is structural, not merely an omitted grant: even if a Maintenance
  -- staff member were also added to qc_authority, the self-clearing loop the
  -- pack forbids would still be impossible. If the plant's real SOP lets one
  -- person wear both hats, that is evidence the Boss must supply (§12) and
  -- this line is where it would be relaxed — deliberately fail-closed until then.
  if maintenance.is_staff() then
    raise exception 'FORBIDDEN: Maintenance does not own QC clearance truth (§1, §43.8) — a Maintenance Executive/Manager may send a case to QC but may never decide it';
  end if;

  -- (2) Positive authority: an explicit, separately-granted QC identity.
  if not maintenance.is_qc_authority() then
    raise exception 'FORBIDDEN: only an identity granted QC authority may record a QC decision (§12 — see maintenance.qc_authority)';
  end if;

  if p_decision not in ('CLEARED', 'REJECTED') then
    raise exception 'INVALID_DECISION: must be CLEARED or REJECTED';
  end if;
  if p_decision = 'REJECTED' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'REASON_REQUIRED: a reason is mandatory for QC rejection';
  end if;

  select case_id, decision into v_case_id, v_existing_decision
  from maintenance.clearances where id = p_clearance_id for update;
  if not found then
    raise exception 'CLEARANCE_NOT_FOUND: %', p_clearance_id;
  end if;
  -- Idempotency: a retry cannot create a second decision or a second event.
  if v_existing_decision <> 'PENDING' then
    raise exception 'ALREADY_DECIDED: clearance % is already %', p_clearance_id, v_existing_decision;
  end if;

  update maintenance.clearances set
    decision = p_decision,
    decision_reason = p_reason,
    decided_at = now()
  where id = p_clearance_id;

  if p_decision = 'CLEARED' then
    perform maintenance.transition_case(v_case_id, 'MAINTENANCE_RELEASED');
  else
    perform maintenance.transition_case(v_case_id, 'QC_REJECTED', p_reason);
  end if;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case_id, 'QC_DECISION', v_actor, p_reason,
          jsonb_build_object('clearance_id', p_clearance_id, 'decision', p_decision));

  -- The 0007 version wrote a case_event but no audit_log row, so the QC actor
  -- was not in the audit trail at all. Required by the remediation DoD
  -- ("QC decision audited") and by §43.3.
  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, before, after, reason)
  values (v_actor, 'qc_decision', 'maintenance.clearances', p_clearance_id,
          jsonb_build_object('decision', 'PENDING'),
          jsonb_build_object('decision', p_decision, 'case_id', v_case_id),
          p_reason);

  return jsonb_build_object('clearance_id', p_clearance_id, 'case_id', v_case_id, 'decision', p_decision);
end;
$$;
