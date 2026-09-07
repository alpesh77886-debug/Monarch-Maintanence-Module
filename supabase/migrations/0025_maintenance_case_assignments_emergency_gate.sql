-- MONARCH Maintenance — Loop 26: close a live-exploitable RLS bypass on
-- `case_assignments` (§5.5 assignment authority, §6 emergency two-step).
--
-- Systematic RLS-policy audit this loop: every policy's `qual`/`with_check`
-- pulled via `pg_policies` and read against its own migration's comment,
-- looking for a mismatch between what a policy is documented to allow and
-- what it actually allows. `case_assignments_insert` (0004) is documented
-- as "the emergency direct-start path (§5.5: 'technician can start
-- directly')... deliberately immediate and self-service" — but its actual
-- check never verifies the case is an actual confirmed emergency:
--
--   with check (emergency_direct_start AND technician_user_id = auth.uid())
--
-- `emergency_direct_start` is a plain client-supplied column value on the
-- INSERT itself, not derived from anything server-side. Verified live,
-- **exploitable, not just theoretical**: signed in as the seeded
-- non-staff technician identity, a direct insert into `case_assignments`
-- with `emergency_direct_start = true` succeeded against a case whose
-- `emergency_confirmed` was `false` (never even claimed as an emergency).
-- That row is `is_active = true`, and the case page's own
-- `isAssignedTechnician` check (`page.tsx`) is defined purely as "an
-- active case_assignments row for this technician" — which in turn grants
-- `canRecordIntervention` and `canRecordSpareUsage`. So any non-staff
-- technician identity could self-grant intervention/spare-usage recording
-- rights on **any case in the system**, any time, no emergency required,
-- no staff mediation at all — a real bypass of §5.5's staff-mediated
-- assignment, not merely of the emergency path's own §6 two-step gate.
--
-- Fix: the policy now also requires the target case to actually be a
-- confirmed emergency, matching exactly what the pack and this policy's
-- own comment already claimed was the rule.

drop policy if exists case_assignments_insert on maintenance.case_assignments;

create policy case_assignments_insert on maintenance.case_assignments
  for insert to authenticated
  with check (
    emergency_direct_start
    and technician_user_id = auth.uid()
    and exists (
      select 1 from maintenance.cases
      where id = case_id and emergency_confirmed = true
    )
  );
