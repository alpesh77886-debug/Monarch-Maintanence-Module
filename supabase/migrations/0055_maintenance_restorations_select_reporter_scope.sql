-- MONARCH Maintenance — Loop 111: restorations_select RLS gap found while
-- writing browser e2e coverage for the RISK-33 dispute flow (§11).
--
-- restorations_select (migration 0002) has been staff-only since this
-- schema's very first RLS pass, which made sense at the time: only staff
-- ever interacted with a restoration record. RISK-33 (Loop 102-104) changed
-- that — page.tsx's canDisputeRestoration reads the case's restoration
-- history to find the passed TECHNICAL restoration a dispute attaches to —
-- but this policy was never updated to match, so raise_restoration_dispute
-- and the DisputeRestorationForm UI have been unreachable for any
-- NON-STAFF reporter since Loop 104 shipped: their own restorations_select
-- read returns zero rows under RLS, so latestPassedTechnicalRestoration is
-- always null and canDisputeRestoration can never be true. A staff reporter
-- (e.g. an Executive who filed their own case) was never affected, since
-- is_staff() already covered them — which is why the RPC-level Vitest suite
-- (restoration-dispute.test.ts) never caught it: it calls
-- raise_restoration_dispute directly, bypassing the page's read query
-- entirely. Found by the new browser e2e test in this same loop
-- (e2e/lifecycle-authority.spec.ts), driven by a genuinely non-staff
-- reporter (the technician demo account) exactly like §11's own complainant
-- is expected to be.
--
-- Fixed the same way every other case-scoped table's read scope already
-- works (migration 0032's own can_read_case comment: "Case-scoped tables
-- inherit their authorization from this rather than defining their own") —
-- restorations was simply missed when that sweep ran, since RISK-33 did not
-- exist yet. No new authority invented: this is the SAME
-- staff-or-reporter-or-assigned-technician read scope every other
-- case-scoped table already has (evidence, safety_stops,
-- production_boundary_events), applied here for the first time.

drop policy if exists restorations_select on maintenance.restorations;
create policy restorations_select on maintenance.restorations
  for select to authenticated
  using ((select maintenance.is_staff()) or maintenance.can_read_case(case_id));
