-- Loop 28 (RISK-20): case_assignments_insert (fixed for the emergency gate
-- in migration 0025/RISK-18) still left every column besides
-- technician_user_id/emergency_direct_start fully client-writable on the
-- direct self-insert path — the same shape of gap as cases_insert
-- (RISK-19), just smaller in blast radius.
--
-- Live-verified: the seeded non-staff technician identity, self-inserting
-- via the legitimate emergency_direct_start path (a genuinely confirmed
-- emergency), could also set assigned_by_user_id to a real staff member's
-- id (e.g. the manager who merely confirmed the emergency, or any other
-- staff id) — falsely attributing the assignment to staff mediation that
-- never happened. §5.5's whole point is that emergency_direct_start is
-- the *self-service* carve-out specifically because no staff mediated it;
-- an assignment row that claims otherwise is a forged audit trail on a
-- table §29 relies on ("the UI is not a security boundary").
--
-- Fix: on the direct-insert path, force assigned_by_user_id to NULL (no
-- staff mediated this insert, by construction) and is_active/deactivated_at
-- to the only state a brand-new active assignment can honestly start in.
-- The staff-mediated path (assign_technician, SECURITY DEFINER) is
-- unaffected — it bypasses RLS entirely and is the only place
-- assigned_by_user_id is ever legitimately set.

drop policy if exists case_assignments_insert on maintenance.case_assignments;

create policy case_assignments_insert on maintenance.case_assignments
  for insert to authenticated
  with check (
    emergency_direct_start
    and technician_user_id = auth.uid()
    and assigned_by_user_id is null
    and is_active = true
    and deactivated_at is null
    and exists (
      select 1 from maintenance.cases
      where id = case_id and emergency_confirmed = true
    )
  );
