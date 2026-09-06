```text
MONARCH MAINTENANCE — BOSS APPROVAL GATE

Loops completed: 06–10
Overall V1 completion: ~76% (16/25 §32 items fully done, 6 partial, 3 not started)

CRITICAL: 0
HIGH: 0
MEDIUM: 1 (RISK-05 — still no browser E2E run against the live app)
LOW: 1 (RISK-06 — Supabase anon key / Sentry DSN as source fallbacks)

Vercel: GREEN — production deployment is commit 39380c7 (merge of PR #6,
  Loop 10), confirmed READY and serving a correct /login page (200)
Sentry: GREEN (unchanged since Loop 2 — still verified with a real
  captured test error, no new verification event this batch)
Tests: 44 automated (Vitest, 7 files) wired into CI. All PRs this batch
  (#2–#6) went green in real GitHub Actions CI before merge, including
  one PR (#5) where CI itself caught a real regression (RISK-14) that
  manual review had missed — see §C/§H.

Major areas closed this batch:
- Automated test suite (Loop 6) — the top item from the last gate report.
- Notifications + 24h/1h escalation timers (Loop 7, §23/§7.2/§7.3).
- Spare request/usage RPCs + UI (Loop 8, §16/§3.3).
- Duplicate case + false-complaint closure (Loop 9, §4.6/§4.7).
- Preventive maintenance — recurring/one-time/overdue (Loop 10, §17).

Two real defects found and fixed this batch (both RESOLVED, see §C/§H):
- RISK-13: `is_manager()` returned NULL instead of false for non-staff
  callers — could have let a non-staff caller bypass the Manager-only
  spare-approval gate undetected. Found by the Boss-mandated pattern of
  testing negative cases with the non-staff seeded account.
- RISK-14: Loop 9's `transition_case` rewrite silently dropped the Loop 5
  QC gate because it was built from a stale copy of the function. Caught
  by CI on PR #5 (not by manual review), fixed the same session, and the
  process gap that caused it (a live-only fix never captured in a
  migration file) is now called out as a standing rule going forward.

Still not started: shift handover/availability (§32 item 16), Production
non-restart / started-without-release recording (item 12), KPI/impact
dashboard (item 22). Recurrence detection (§18) also not started —
correctly blocked in part on PENDING-04 (threshold/window), though the
configurable-hybrid-model scaffolding itself could be built without it.

Recommended next 5-loop work (priority order) — see §J for detail:
1. Browser E2E against the live app (RISK-05) — now that most backend
   surface exists, this is the highest-leverage remaining gap.
2. Shift handover / availability handling (§32 item 16).
3. Production non-restart / started-without-release recording (§32 item 12).
4. KPI/impact dashboard (§32 item 22).
5. Recurrence detection scaffolding (§18) + CAPA (§19).

STATUS: WAITING FOR BOSS APPROVAL
```

---

# A. Executive Status

- **Current loop:** 10 (batch complete)
- **Gate:** 2nd hard gate (after Loop 10), reached for the first time
- **Overall project status:** Standalone Maintenance module live on Vercel,
  backed by a dedicated Supabase project. Beyond the core lifecycle shipped
  in the first batch, this batch adds the full notification/escalation
  layer, spare parts request/usage with the ₹12,000 financial-authority
  gate, duplicate/false-complaint closure paths, and preventive
  maintenance (plans, approval, generation, overdue flagging). An
  automated test suite now runs in CI on every push and PR, and it earned
  its keep this batch — it caught a real regression before it reached
  `main`.
- **Current implementation state:** 13 SQL migrations applied to the live
  Postgres database (0001–0013); roughly 30 SECURITY DEFINER RPCs across
  the case lifecycle, emergency workflow, notifications, spares, PM, and
  duplicate/false-complaint paths; two `pg_cron` jobs (`
  maintenance-escalation-scan` every 5 min, `maintenance-pm-scan` hourly);
  a Next.js app with the case detail page now composing 12 panels/forms
  plus new standalone `/pm` and notification-bell surfaces; 44 Vitest
  integration tests across 7 files, all green in real GitHub Actions CI.

# B. Completion

**Total approved V1 requirements:** 25 (`IMPLEMENTATION_PACK.md` §32)

| # | Requirement | Status (was, Loop 5) | Status (now, Loop 10) |
|---|---|---|---|
| 1 | Maintenance Case intake | DONE | DONE |
| 2 | Acknowledgement + ownership + notification | PARTIAL | **DONE** — Loop 7 wired `CASE_ACKNOWLEDGED` notification into `acknowledge_case` |
| 3 | Triage + priority + Manager override | PARTIAL | PARTIAL — unchanged; priority still only settable at acknowledgement, no separate change/override RPC or UI |
| 4 | Technician assignment/reassignment + multiple technicians | PARTIAL | PARTIAL — unchanged; assign done, no explicit deactivate/reassign RPC |
| 5 | Emergency intervention recording | PARTIAL | PARTIAL — the direct-start RLS path (§5.5) is unchanged from Loop 3; Loop 7 built the related but distinct §6 claim/confirm authorization workflow with UI, which feeds item 15's escalation clock, not this item's "start before assignment" UI |
| 6 | Core lifecycle with valid-transition enforcement | DONE | DONE |
| 7 | Diagnosis/intervention records with separated semantics | PARTIAL | PARTIAL — unchanged |
| 8 | Temporary restoration as explicit non-closure state | DONE | DONE |
| 9 | Technical restoration + verification and failure path | DONE | DONE |
| 10 | QC-required gate + manual Send-to-QC + rejection history | DONE | DONE (re-verified after RISK-14) |
| 11 | `MAINTENANCE_RELEASED` boundary | DONE | DONE |
| 12 | Production non-restart / started-without-release recording | NOT STARTED | NOT STARTED — unchanged |
| 13 | Reopen / duplicate / false complaint | PARTIAL | **DONE** — Loop 9 built `mark_duplicate_case` + `close_false_complaint` |
| 14 | WAITING + explicit INTERNAL/EXTERNAL + free text + dependency | DONE | DONE |
| 15 | Resume-ready + escalation + reminders | PARTIAL | **DONE** — Loop 7 built the 24h WAITING escalation + repeat Manager reminder and the 1h confirmed-emergency escalation, both `pg_cron`-scheduled |
| 16 | Shift handover / availability handling | NOT STARTED | NOT STARTED — unchanged |
| 17 | PM recurring + one-time + overdue | NOT STARTED | **DONE** — Loop 10 |
| 18 | Spare/dependency capture | NOT STARTED | **DONE** — Loop 8 |
| 19 | LOTO/PTW safety gate seams without invented authority | PARTIAL | PARTIAL — correctly unchanged, still gated on PENDING-01 |
| 20 | Audit + idempotency | DONE | DONE |
| 21 | Mobile-first execution UX | PARTIAL | PARTIAL — spares, PM, duplicate/false-complaint, and emergency claim/confirm all now have UI; shift handover remains the one major flow with none |
| 22 | KPI/impact capture | NOT STARTED | NOT STARTED — unchanged |
| 23 | Security/access foundation | DONE | DONE |
| 24 | Executive Observation + Action Continuity Journal | DONE | DONE |
| 25 | Spare Usage Traceability | NOT STARTED | **DONE** — Loop 8 |

**Completed:** 16 · **Partial:** 6 · **Not started:** 3
**Completion score** (DONE=1.0, PARTIAL=0.5, NOT STARTED=0): 19.0/25 ≈ **76%**
(up from 56% at the last gate)

This is scored against the requirement matrix, not file/commit/LOC counts.

# C. Error Register

No unresolved material defects. Two were found and fixed within this batch:

| ID | Description | Affected requirement | Severity | Discovered in loop | Reproduction/evidence | Current status | Recommended fix |
|---|---|---|---|---|---|---|---|
| RISK-13 | `maintenance.is_manager()` returned `NULL` (not `false`) for any authenticated caller with no `maintenance.staff` row, because `current_staff_role() = 'MAINTENANCE_MANAGER'` propagates NULL. Its only prior use (an RLS `with check`) was accidentally safe; `approve_spare_request`'s standard `if not is_manager()` guard was not — PL/pgSQL's `IF NULL` silently skips the branch. | §3.3 financial/spare authority (item 18) | HIGH | Loop 8 | Reproduced live via `execute_sql`: before the fix, a non-staff caller's `approve_spare_request` call proceeded past the guard instead of raising `FORBIDDEN`. | RESOLVED — fixed at the source (`is_manager()` now `coalesce(..., false)`), migration `0010`, re-verified live | (fixed) |
| RISK-14 | Loop 9's `transition_case` rewrite (needed to add the `DUPLICATE` guard) was built from a stale copy of the function predating the §13 QC gate (Loop 5) and its RISK-11 fix — which had only ever been applied live, never captured in a migration file. The rewrite silently dropped the QC gate: a direct `TECHNICALLY_RESTORED -> MAINTENANCE_RELEASED` would have succeeded even with `qc_required = true`. | §13 QC gate (item 10) | HIGH | Between Loop 9 and 10 | CI on PR #5 failed both QC-gate tests in `qc-and-restoration.test.ts`; reproduced live via `execute_sql` before fixing (confirmed the gate really was gone). | RESOLVED — restored via migration `0012`, re-verified `qc_required` true/null/false all behave correctly, `DUPLICATE` guard intact | (fixed) |

Open (non-defect) risks carried forward — see `RISK_REGISTER.md`:
RISK-01 (Production substrate doesn't exist yet, MEDIUM), RISK-02 (LOTO/PTW
SOP pending, HIGH/safety-adjacent — still no live exposure, nothing
implemented acts on it), RISK-03 (recurrence threshold pending, LOW),
RISK-04 (granular permission matrix pending, MEDIUM), RISK-05 (no browser
E2E run against the live app, MEDIUM — still open, see §J), RISK-06 (anon
key/DSN as source fallbacks, LOW).

RISK-07 (no automated test framework) is no longer open — Loop 6 resolved
it, and this batch is the first to actually exercise the resulting safety
net for real (see §H).

# D. Consequence / Risk

No CRITICAL or HIGH defects are currently open — RISK-13 and RISK-14 were
both found and fixed within this batch, before either reached a real user.

**What RISK-13 could have caused if it had shipped unnoticed:** a
non-staff authenticated user (any reporter or technician identity, not
just Maintenance staff) calling `approve_spare_request` directly would
have bypassed the Manager-only authorization check on a >₹12,000 spare
request — a direct breach of the §3.3 locked financial-authority boundary,
with no audit trail distinguishing it from a legitimate Manager approval
(the RPC still records `approved_by` as the caller, so the record would
look valid). This was caught by the same discipline used throughout this
project — testing the *negative* case with the seeded non-staff account,
not just the happy path — before it ever reached the deployed app.

**What RISK-14 could have caused if CI had not caught it:** a case with
`qc_required = true` (or never decided) could have been released to
production via a direct `transition_case` call, completely skipping the
`send_to_qc`/`qc_decision(CLEARED)` path §13 locks as mandatory. This is
the same defect class as RISK-11 from the first gate, reintroduced by
accident during unrelated work — which is itself the more important
finding: a rewrite of any locked-behavior function, however small the
stated change, needs the full existing guard set re-verified, not
assumed. The fact that CI caught it on the very next push (rather than
silently merging to `main`) is direct vindication of investing in Loop 6's
test suite — this is the incident RISK-07's original consequence
paragraph predicted almost exactly.

# E. Vercel Status

- **Linked project:** `monarch-maintenance-module` (prj_iBJOL0iGapB4Id3w9r49IDUV7vBf), team `Monarch`
- **Current deployment:** commit `39380c7` (merge of PR #6, Loop 10), target `production`, state READY
- **Build result:** GREEN — every PR this batch (#2 through #6) built and
  deployed successfully; no failed Vercel build at any point in the batch
- **Deployment result:** GREEN — live at
  https://monarch-maintenance-module.vercel.app
- **Runtime verification result:** `/login` fetched via the Vercel MCP
  tool at the current production deployment: 200, correct markup (sign-in
  form, MONARCH Maintenance title). Every intermediate loop's preview
  deployment was also confirmed READY before merging (see the Vercel
  comment threads on PRs #3–#6).
- **Known deployment blockers:** none. Same caveat as the last gate: this
  sandbox cannot browse the live URL itself (egress policy), so runtime
  verification here is via the Vercel MCP's own fetch tool, not a real
  browser session — see RISK-05.

# F. Sentry Status

- **Connected:** yes — org `monarch-bo`, project `monarch-maintenance-module`
- **SDK/configuration status:** unchanged since Loop 2 — `@sentry/nextjs`
  wired for client/server/edge; build succeeds with it in place
- **Verification event result:** unchanged since Loop 2 — a deliberately
  triggered test error was confirmed captured and marked resolved; no new
  verification event was triggered this batch (no code path in Loops 6-10
  needed one to validate)
- **Unresolved errors:** none
- **Coverage caveat:** unchanged from the last gate — this confirms the
  pipe works, not that the new Loop 6-10 code is bug-free. No real user
  traffic has hit the app yet.

# G. Testing Status

- **Unit tests:** none (this project uses integration tests exclusively,
  by design — see `tests/README.md`)
- **Integration tests:** 44 Vitest tests across 7 files, run as real
  signed-in users against the live `maintenance` schema, wired into CI
  (`npm test` in `.github/workflows/ci.yml`) on every push/PR:
  - Loop 6 (17 tests): Scenario A/B/C, invalid-transition rejection,
    idempotent replay, append-only enforcement, technician
    assignment/impersonation, first-valid-actor ownership race, both
    WAITING paths.
  - Loop 7 (10 tests): §6 emergency claim/confirm guards and ordering,
    `run_escalation_scan` permission lockout, notification RLS,
    `mark_wait_resolved`'s immediate notification.
  - Loop 8 (7 tests): §3.3 ₹12,000 threshold computation, the full
    Manager-approval gate (including the RISK-13 regression case),
    `APPROVAL_REQUIRED` usage gate, usage-recording actor eligibility.
  - Loop 9 (4 tests): `transition_case`'s `DUPLICATE` lockout,
    `mark_duplicate_case` guards + primary-untouched assertion,
    `close_false_complaint` reporter-only + OTHER/explanation rules.
  - Loop 10 (6 tests): PM plan-creation and approval guards, `run_pm_scan`
    permission lockout.
- **State-machine tests:** covered above (transition graph + all guards,
  including the QC gate both before and after the RISK-14 fix).
- **Authorization tests:** covered above — every new RPC this batch has a
  negative-case test for its actor-eligibility guard, following the
  pattern that caught RISK-13.
- **Audit/idempotency tests:** covered (Loop 6, unchanged; every new RPC
  this batch writes to `case_events`/`audit_log`, verified live via
  `execute_sql` per-loop in `CHANGELOG.md`, not re-asserted per-row in
  Vitest).
- **End-to-end (browser) tests:** still NOT run — same RISK-05 as every
  prior gate. `e2e/smoke.mjs` exists but this sandbox's egress proxy
  blocks `*.supabase.co`/`*.vercel.app`.
- **Deployment smoke checks:** done for every loop — each PR's Vercel
  preview and the resulting production deployment were confirmed READY.
- **Regression tests:** this batch's real regression-test story is
  RISK-14 itself: CI caught it, it was fixed the same session, and
  `tests/qc-and-restoration.test.ts`'s existing QC-gate tests (written in
  Loop 6, before RISK-14 existed) are what caught it — direct evidence the
  test suite is doing its job, not just passing by construction.

# H. Architecture Integrity

**One integrity incident this batch, fully disclosed:** Loop 9's
`transition_case` rewrite briefly weakened the §13 QC gate — not as a
deliberate design decision, but as an unintentional regression from
copying a stale version of the function (see RISK-14, §C/§D). The buggy
version was live against the actual Supabase project (not merely "in a
branch") for a window within this session — from when migration `0011`
was applied until the fix (`0012`) was applied roughly 15 minutes later —
but was never exposed to real user traffic (pre-launch, no live users
yet) and never reached the `main` branch or the production Vercel
deployment, because CI on PR #5 failed before merge. This is disclosed
here in full per `CLAUDE.md`'s own instruction that a green build does
not equal a correct product, and because §19.12/H requires flagging any
event where a locked requirement was changed, weakened, inferred, or
contradicted — even one that was self-corrected before shipping.

No other locked requirement was changed, weakened, inferred, or
contradicted this batch. Mechanism choices made where the pack was silent
on *how* (not *what*):
- PM frequency (§17) is never defaulted — `create_pm_plan` requires an
  explicit value for a RECURRING plan rather than picking one, reading
  "exact frequencies must not be invented" as "must be supplied," not "the
  database invents a number."
- The false-complaint "predefined closure reason" (§4.7) is deliberately
  NOT hardcoded as a fixed database enum — the pack requires the concept
  but never enumerates values; only the OTHER+explanation rule is enforced
  server-side, the reason list itself lives in the UI as presentation
  convenience.
- `DUPLICATE` is routed through a dedicated `mark_duplicate_case` function
  rather than the generic `transition_case`, because the generic RPC
  cannot record the primary-case link §4.6 requires — the same "own
  function for a transition with extra mandatory fields" pattern already
  used for `reopen_case` since Loop 1.
- `is_manager()` was hardened to `coalesce(..., false)` at the source
  (RISK-13) rather than patching each call site individually, so every
  future use anywhere in the schema is safe by construction.

# I. Pending Evidence Gates

Unchanged from every prior gate — see `docs/pending-gates.md`:
PENDING-01 (LOTO/PTW SOP — no plant evidence supplied, still correctly
unimplemented beyond the seam columns), PENDING-02 (moot — Production
module sibling repo still has no live schema), PENDING-03 (granular
permission matrix beyond the 2 locked roles), PENDING-04 (recurrence
threshold/window — recurrence itself, §18, is still entirely unbuilt, so
this gate has not yet blocked any actual work), PENDING-05 (none
discovered this batch).

# J. Recommended Next Work (priority order)

1. **Browser E2E against the live app** (RISK-05) — open since Loop 1.
   With most of the backend surface now built (13 migrations, ~30 RPCs),
   the highest-leverage remaining gap is verifying the UI layer actually
   wires up correctly from a real browser, not just via `execute_sql`
   proxying for it. Needs to run from an environment whose egress isn't
   blocked, against `https://monarch-maintenance-module.vercel.app`.
2. **Shift handover / availability handling** (§32 item 16, §22) — the one
   §32 must-have area with zero implementation so far.
3. **Production non-restart / started-without-release recording** (§32
   item 12, §13.1/§13.2) — schema-level seam only; needs RPCs + UI for
   recording these two specific boundary-violation events.
4. **KPI/impact dashboard** (§32 item 22, §25) — the other fully-unbuilt
   must-have; needs the minimum operational measures from §25.2 surfaced
   somewhere in the UI, likely a new `/dashboard` route.
5. **Recurrence detection scaffolding** (§18) — can build the hybrid
   flag-and-evidence-tier mechanism itself (configurable, no hard-coded
   threshold, per the pack's own instruction) without waiting on
   PENDING-04 for the *value* of that threshold; CAPA (§19) naturally
   follows since it consumes recurrence flags.
6. **Remaining partials** — priority-change/Manager-override RPC (item
   3), technician reassignment/deactivation RPC (item 4), a dedicated
   emergency direct-start UI distinct from the claim/confirm panel (item
   5), and separated diagnosis-vs-intervention semantics (item 7) — all
   smaller, well-specified gaps in otherwise-PARTIAL areas.

# K. Boss Decision

**WAITING FOR BOSS APPROVAL**
