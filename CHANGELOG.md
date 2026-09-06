# Changelog

All notable engineering loops for MONARCH Maintenance are logged here, oldest first
within each loop. Entries are never rewritten to look cleaner after the fact.

## Loop 1 — 2026-09-06

**Summary:** Repository forensics + governance baseline + start of core data model.

**Requirements affected:** §36.1 (pre-coding forensics), §19.3–19.5 (repo governance),
§26 (data model), foundation for §29 (RBAC).

**Findings:**
- This repo and the sibling `Monarch-Production-Module` repo were both placeholder-only
  (`index.html` + README) at the start of implementation — no existing Maintenance or
  Production application code to reuse or regress against.
- Two Supabase projects exist on the account; neither matches Maintenance's domain
  (one backs the unrelated `accountoperatingsystem` generic task app, the other backs
  `Raccoon`/Store Register and is currently paused). Decision: Maintenance gets its own
  dedicated Supabase project, consistent with the standalone-module requirement (§2.1).
- Vercel team `Monarch` and Sentry org `monarch-bo` already exist and already host the
  Production and AOS modules — Maintenance will be added alongside them, not create new
  team/org infrastructure.

**Material changes:**
- Added `IMPLEMENTATION_PACK.md` (full, unabridged v0.2 pack — verbatim contract).
- Added `CLAUDE.md` operating rules, `README.md`, `STATUS.md`, `APPROVAL_GATE.md`,
  `RISK_REGISTER.md`, this `CHANGELOG.md`, and `/docs/*` seams.
- (in progress) `supabase/migrations/` — core `maintenance` schema.
- (in progress) Next.js application skeleton.

**Tests:** none yet — no business logic committed yet in this loop.

**Deployment/reference:** none yet.

**Known limitations:** No UI, no business operations, no RLS policies enforced yet as
of the start of this entry. Updated as the loop completes — see STATUS.md for the live
picture, this entry is append-only history.
