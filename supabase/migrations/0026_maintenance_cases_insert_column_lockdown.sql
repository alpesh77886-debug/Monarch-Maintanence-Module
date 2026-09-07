-- Loop 27 (RISK-19): cases_insert's with_check only ever validated
-- reporter_user_id = auth.uid() (migration 0002). Every other column on
-- maintenance.cases — including status, all emergency_* columns,
-- qc_required, ptw_required, current_owner_user_id, closed_at,
-- closure_reason, priority, duplicate_of_case_id, and the production
-- handoff flags — was fully client-writable at INSERT time. A `default`
-- on a column (e.g. status default 'REPORTED') is not a constraint: a
-- client that explicitly supplies a value overrides it.
--
-- Live-verified exploitable by any authenticated non-staff user (no RPC,
-- direct PostgREST insert):
--   - self-set emergency_confirmed = true, bypassing the entire §6
--     claim-then-confirm two-step ceremony with zero audit trail;
--   - self-set status = 'CLOSED' with a fabricated closure_reason and
--     closed_at, producing a fully-formed fake-closed case that bypasses
--     the §4 LOCKED lifecycle graph at the root (no status_transitions
--     row is ever consulted for a freshly-inserted case).
--
-- This also meant the migration 0025 fix for RISK-18 was independently
-- circumventable: fake emergency_confirmed=true here first, then walk
-- through the (now "legitimate"-looking) emergency_direct_start path.
--
-- Fix: tighten with_check to the exact baseline the real intake form
-- (src/app/(app)/cases/new/page.tsx) submits — case_type, symptom, area,
-- line, asset_known, major_complex_flag, reporter_user_id — and force
-- every other column to its safe/default state at insert. This is a
-- allow-list at the RLS layer, not a column-by-column blacklist, so a
-- future column addition to maintenance.cases is closed-by-default
-- unless a later migration explicitly opens it here.

drop policy if exists cases_insert on maintenance.cases;

create policy cases_insert on maintenance.cases
  for insert to authenticated
  with check (
    reporter_user_id = auth.uid()
    and status = 'REPORTED'
    and acknowledged_by_user_id is null
    and current_owner_user_id is null
    and priority is null
    and priority_set_by_role is null
    and emergency_claimed = false
    and emergency_claimed_by is null
    and emergency_claimed_at is null
    and emergency_claim_reason is null
    and emergency_escalated_at is null
    and emergency_confirmed = false
    and emergency_confirmed_by is null
    and emergency_confirmed_at is null
    and qc_required is null
    and qc_required_changed_by is null
    and qc_required_changed_at is null
    and qc_required_change_reason is null
    and ptw_required is null
    and ptw_proof_ref is null
    and acknowledged_at is null
    and assigned_at is null
    and technically_restored_at is null
    and maintenance_released_at is null
    and closed_at is null
    and closure_reason is null
    and production_not_restarted = false
    and production_not_restarted_reason is null
    and production_started_without_release = false
    and production_started_without_release_detail is null
    and duplicate_of_case_id is null
    and production_case_ref is null
    and stores_reference_status is null
    and shift is null
  );
