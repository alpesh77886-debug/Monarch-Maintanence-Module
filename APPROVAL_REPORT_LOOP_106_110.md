# Approval Gate Report — Loops 106-110

Per `IMPLEMENTATION_PACK.md` §19.9/§19.13, this is the mandatory hard stop
after the 5th completed loop. Autonomous loop work is PAUSED. Loop 111 will
not start without explicit continuation language from the Boss — silence,
"looks good," or an unrelated reply is not approval.

## What this batch was

Gate 21's report closed with RISK-32 and RISK-33 both RESOLVED and no
outstanding business-rule question. The Boss replied with a compound
message — explicit continuation ("Start karo 106 se 110"), a live-DB
cleanup request conditional on safety, a question about Manager/
Technician screen parity, and two concrete spare-consumption asks
(multi-material recording, an Excel export). This batch is entirely
that request, worked in order.

## The Boss's ask, as given

> "Start karo 106 se 110...aur sara test data nikalo agar application ko
> koi nuksan nahi hai to... Dusri baat kya Manager aur technician ki
> screens aisi hai?? Agar nahi hai to ban sakti hai?? Dusri baat 'spare
> consumption' me Technical ek se jyada materials bhi use kar sakta
> hai... Like 2 bearing, 3 switch, 5 mcb etc... Saath me me ye chahta hu
> ke 'Spare consumtion' ke option pe click karne pe mujhe option chahiye
> ke vaha Click karne pe excel download ho sake ke konsa spare, kitna,
> kaha use huva, kisne kiya, konsi date ko, kis machine me laga etc.
> etc."

Four concrete items, plus one direct question, all addressed this batch.

## What happened across these 5 loops

| Loop | What | Result |
|---|---|---|
| 106 | Live test-data cleanup + Q&A | Verified first (not assumed): all 1101 cases in the Maintenance Supabase project were `[AUTOTEST]`-tagged, zero real business records. Cleared via the existing safety-checked `cleanup_synthetic_cases` function (migration 0036 — the same one every prior cleanup in this project has used, refuses any non-synthetic row all-or-nothing) plus the same synthetic-prefix verification for `pm_plans`/`recurrence_rules`/dangling PM notifications/orphan idempotency keys. Left untouched: the 2 real staff seed accounts, 1 `qc_authority` grant, and `audit_log` rows not tied to a deleted object (CLAUDE.md's append-only rule). Answered the screens question honestly: today Manager/Technician share one nav and one Home page, gated by show/hide booleans, not separate experiences — no code invented to make the answer look better than it is. |
| 107 | Multi-material spare consumption | `spares-panel.tsx` gained a "Record materials used (multiple at once)" form — dynamic rows (spare name / qty / estimated amount), shared asset ref/outcome. Each row runs the same `raise_spare_request` → `record_spare_usage` pair the existing single-item forms already use, sequentially, with a per-row result summary (a >₹12,000 item needing Manager approval is called out per row, not silently dropped). No new RPC, no migration — the data model already keeps each material as its own row pair, correctly, for §16.1 traceability; this was a UI convenience gap only. |
| 108 | Spare-consumption Excel export | New `src/app/api/spares/export/route.ts` (staff-only — refuses a non-staff caller outright, since a cross-case consumption report is a management/audit artifact, not self-service). Reads `spare_usage` joined with `spare_requests`/`cases`, resolves the actor to a staff name the same way every other panel already does, streams a real `.xlsx` via the new `exceljs` dependency. "Download Excel" button on the Spares page. Columns: date, spare, quantity, estimated amount, case number, symptom, area, line, machine/asset, used by, outcome, stores reference status/id — every field the Boss asked for. Join logic verified against a live synthetic scenario (inserted, confirmed the joined result matched exactly, cleaned up — no residual test data). |
| 109 | Technician home visibility | A non-staff technician's `/home` page showed only a warning banner and one generic "Cases" tile — zero visibility into their own actively-assigned work — despite `cases_select` (migration 0032) and `case_assignments_select` (migration 0002) RLS already permitting exactly that read. Fixed by querying `case_assignments` + `cases` (two-query + `Map` join, matching the established pattern in `/spares/page.tsx` — no PostgREST embed syntax, which this codebase has zero other precedent for and which this sandbox cannot verify live) and rendering a "My assigned work" list. Also un-gated `NotificationBell` from `isStaff`: `notifications_select` (migration 0008) is recipient-scoped by `auth.uid()`, not staff-gated, so a technician could already receive a notification with no way to see it. |
| 110 | Manager analytics | The Dashboard already had a status-distribution bar (Loop 21) but no trend view. Added `TrendChart` (`src/components/stat-card.tsx`) — a 14-day created-vs-closed bar chart wired into the Dashboard using the same `cases` rows that page already fetches (no new query, no new RLS surface). Bucket keys and case-day keys both derive from the UTC calendar date embedded in the ISO timestamp on both sides, so they line up regardless of server timezone — verified with a standalone Node script, not just reasoned about. Bar heights are plain pixels computed in JS, not a CSS percentage-height inside a flex container (a pattern this codebase has no precedent for and would have shipped unverified). |

## A real CI-caught bug, not a flake — root-caused and fixed same-PR

PR #100's `e2e` job failed on the first push (run 34888044419, head
`a373945`). Read the actual job log, not just the pass/fail conclusion:
`roles-and-notifications.spec.ts`'s `getByLabel("Spare name")` resolved to
2 elements — a `strict mode violation`, deterministic, not infrastructure
flake. Root cause: Loop 107's multi-material form reused `"Spare name"`,
`"Asset/machine ref"`, and `"Outcome"` as `FormField` labels, each already
used by the existing single-item "Raise a spare request" / "Record spare
usage" forms rendered on the same panel — a genuine duplicate-accessible-
name defect (an a11y bug independent of the test), not a test artifact.

Fixed at the source, not by patching the test to disambiguate: the bulk
form's per-row spare-name field is now labelled `"Material N name"`
(distinct per row — also a real accessibility improvement, since a
screen-reader user filling several rows benefits from knowing which row
they're in), and its two shared fields are now `"Asset/machine ref (all
materials)"` / `"Outcome (all materials)"`. Grepped `e2e/` first to
confirm no other spec depended on the old label text before changing it.
Re-ran CI — both jobs (`lint-and-build`, `e2e`) passed clean on the fix
commit (run 34889479925), `mergeable_state` came back `clean`, and PR
#100 was merged (`merge` method, not squash) and unsubscribed.

## Verification posture this batch

- Every loop's `tsc --noEmit` and `eslint` came back clean; Loops 107-110
  additionally ran a full `next build`.
- Loop 106's live-DB cleanup was verified read-only first (a direct query
  confirming 100% `[AUTOTEST]` tagging) before any deletion ran, and used
  only the existing, already-safety-checked cleanup function — no new
  deletion mechanism invented.
- Loop 108's new join/query logic was verified against a live synthetic
  scenario via the Supabase MCP tool (insert → compare → clean up), since
  this sandbox cannot exercise the route handler end-to-end.
- Loop 110's date-bucketing logic was verified with a standalone Node
  script covering a boundary case (a case landing at 23:59 UTC) and an
  out-of-window case (confirmed correctly excluded from every bucket).
- CI (GitHub Actions, live Supabase project) remains this batch's actual
  test-execution evidence for the full suite, same as every batch before
  it — this sandbox's own egress proxy still blocks direct Supabase
  access.

## `npm audit` — one new finding, documented not silently accepted

Loop 108's `exceljs` dependency pulls in a `uuid` version with a known
moderate advisory (GHSA-w5hq-g745-h8pq). Not reachable from any
Maintenance-supplied input — the only caller is `exceljs`'s own internal
ID generation, never a caller-supplied buffer. Documented as **RISK-34
(LOW, OPEN)** in `RISK_REGISTER.md` rather than force-downgrading
`exceljs` (which would pin a breaking `3.4.0`), matching the Loop 59/98
"small bumps only" precedent.

## Open items

- RISK-32/RISK-33 remain RESOLVED (unchanged this batch).
- **RISK-34 (LOW, OPEN)** — new this batch, see above.
- RISK-01/02/03/04/06/07(remaining sub-item) unchanged — all still
  Boss/access-blocked (§35 PENDING items, a Vercel-dashboard-access gap
  this environment doesn't have, and the Production module
  cross-reference correctly deferred until that sibling repo has real
  schema).
- Manager/Technician screens remain functionally shared (one nav, one
  Home page, gated by show/hide booleans) — Loop 109 closed the most
  concrete real gap in that shared model (a technician's own assigned
  work was invisible), but a fully separate Technician mobile
  task-workspace / Manager analytics dashboard, to the depth of the
  Premium UI v2 mockup the Boss attached, was NOT attempted — that would
  be a multi-loop rebuild in its own right, not a bounded fix, and this
  batch's Loop 109/110 work was deliberately scoped to the concrete,
  verifiable gaps in the existing shared pages rather than a speculative
  full rebuild.

## What the Boss needs to decide before Loop 111

1. **Go deeper on Manager/Technician screen separation** — if the shared-
   page model isn't enough and a real separate Technician workspace /
   Manager dashboard (matching the attached Premium UI v2 mockup's depth)
   is wanted, that's a multi-loop scoped project of its own, not a
   5-loop batch item — worth an explicit go-ahead given the size.
2. **A new direction** — a live bug report, a new feature area, explicit
   reprioritization. This report does not pre-select a direction.
3. **If neither:** the remaining self-directed angles (RPC-coverage,
   RLS-audit, Vercel/Sentry-config, dependency-security) were all freshly
   re-verified clean across Gates 19-20; repeating any of them again
   immediately would be re-treading ground without a fresh trigger.
