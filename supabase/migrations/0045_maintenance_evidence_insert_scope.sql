-- Loop 45 — RISK-30. Evidence could be attached to ANY case by ANY signed-in
-- user, including one who cannot read that case.
--
-- evidence_insert's WITH CHECK was:
--
--     (uploaded_by = auth.uid())
--
-- and nothing else. No staff check, and — the part that matters — no check that
-- the caller has any relationship to the case at all.
--
-- The asymmetry is the tell. Every comparable table requires a relationship:
--
--     observations   is_staff() AND actor_user_id = auth.uid()
--     restorations   is_staff() AND recorded_by   = auth.uid()
--     case_assets    is_staff() AND linked_by     = auth.uid()
--     evidence       uploaded_by = auth.uid()          <-- no case predicate
--
-- Proven live as the seeded technician identity (a real auth user with NO
-- maintenance.staff row and no assignment to the target case):
--
--     cases visible to that identity for MC-009600 ....... 0
--     INSERT INTO evidence for MC-009600 ................. SUCCEEDED
--     that row visible back to the writer ................ 0
--     that row visible to Maintenance staff .............. YES, as ordinary
--                                                          evidence on MC-009600
--
-- So an unrelated signed-in user can write into a case's evidence trail blind:
-- they cannot read the case, cannot see the row afterwards, and cannot retract
-- it — but a Maintenance Executive opening that case sees it as legitimate
-- attached evidence. That is audit-trail pollution, the same class as RISK-22
-- (fabricating an intervention on any case).
--
-- This is NOT a reversal of a deliberate decision. evidence-panel.tsx records
-- the intent explicitly: §5.1 lists evidence as an intake field, so "the
-- reporter — not just staff — needs to be able to attach it, potentially before
-- any staff RPC has touched the case at all." That intent is right and is
-- preserved. The defect is that the code said something wider than the intent:
-- the intent is "the reporter, on THEIR case"; the policy said "anyone, on ANY
-- case." Same shape as RISK-22, where 0009's comment described an intent that
-- 0004's code never implemented.
--
-- The fix reuses the predicate this schema already uses for exactly this
-- question rather than inventing a new rule — maintenance.can_read_case():
--
--     is_staff()
--     OR the caller is that case's reporter
--     OR the caller is an assigned technician on that case
--
-- which is precisely the three parties the intent names. INSERT scope now
-- matches SELECT scope (evidence_select already uses the same predicate), so
-- the asymmetry that WAS the defect is gone: you may attach evidence exactly
-- where you may read the case.
--
-- Intake is unaffected: cases_insert requires reporter_user_id = auth.uid(), so
-- by the time a reporter attaches evidence their own case already satisfies
-- can_read_case. Verified live below.
--
-- can_read_case is SECURITY DEFINER and is evaluated AS THE CALLING USER here,
-- so it needs EXECUTE for `authenticated` — which Loop 44 deliberately left in
-- place for exactly this reason when it revoked anon's grants.

drop policy if exists evidence_insert on maintenance.evidence;

create policy evidence_insert on maintenance.evidence
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and maintenance.can_read_case(case_id)
  );
