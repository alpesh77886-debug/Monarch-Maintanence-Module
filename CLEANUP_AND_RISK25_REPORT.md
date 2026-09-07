# Surgical Green-Gap Fix + RISK-25 + Safe Test-Data Cleanup — Forensic Report

Boss-directed task. Report structured per the brief's §30.

---

## A. Green matrix

The brief's authority #2 is the **Sarvam Maintenance Screen Architecture**.
**That document was not supplied**, and it is not in the repository. §4 asks for
UX correction "where current implementation does not follow Sarvam's approved
interaction architecture" — that judgement cannot be made against a document I
do not have, and inventing a bottom-sheet/drawer architecture and calling it
"Sarvam-compliant" would be exactly the fake-green §28 forbids.

So §4/§5/§27 (Sarvam UX, contextual action surfaces, RAG advisory seam) are
reported as **NOT TOUCHED — blocked on a missing input**, not as done. Sending
the Sarvam document unblocks them.

Everything the brief listed under §3 GREEN PRESERVATION was left alone. No
working RPC or state transition was rewritten to change how the UI looks.

| Requirement | Before | Change | Evidence | Status |
|---|---|---|---|---|
| Lifecycle/state engine | correct | none | untouched this task | GREEN |
| QC authority separation | correct (RISK-23) | none | 4-identity live probe, earlier | GREEN |
| ₹12,000 authority boundary | correct | none | red-team matrix, Loop 36 | GREEN |
| Emergency claim vs confirm | correct | none | untouched | GREEN |
| Restoration TEMP/TECHNICAL + PASS/FAIL | correct | none | untouched — semantic forms already distinct | GREEN |
| Observation continuity (9 fields) | correct | none | untouched | GREEN |
| Production restart boundary | correct | none | untouched | GREEN |
| Audit/history | correct | none | append-only preserved | GREEN |
| **INTERNAL WAITING reasons** | **no reason field at all** | **three enforced reasons** | §B below | **FIXED** |
| **INTERNAL wait escalation** | **structurally impossible** | **joins the existing 24h branch** | §B below | **FIXED** |
| **Synthetic test clutter** | **9,214 cases** | **321 remain** | §C below | **FIXED** |
| **Test runs refilling the DB** | **nothing ever cleaned up** | **per-run teardown** | §C below | **FIXED** |
| Sarvam contextual action surfaces | unknown | none | **document not supplied** | NOT TOUCHED |
| RAG advisory seam | absent | none | **document not supplied** | NOT TOUCHED |

---

## B. RISK-25 evidence

### The exact three INTERNAL reasons

| Value | Meaning |
|---|---|
| `REPORTING_MANAGER_APPROVAL_PENDING` | The Maintenance Manager is waiting on the authority they report to. That approval is required before Purchase can proceed with the PO. **Never auto-marked received.** |
| `PURCHASE_ORDER_RELEASE_PENDING` | The approval has arrived; Purchase has not yet released the PO. **Never auto-marked released.** |
| `OTHER` | Any other legitimate internal dependency. **Meaningful detail mandatory** — a placeholder is refused, so "Other" cannot silently absorb a hidden fourth category. |

### Enforced in three layers, not one

| Layer | Mechanism | Live proof |
|---|---|---|
| Frontend | `waiting-form.tsx` offers exactly three options, shown only when reason type is INTERNAL | code |
| Backend RPC | `enter_waiting` raises `INTERNAL_REASON_REQUIRED`, `INVALID_INTERNAL_REASON`, `DETAIL_REQUIRED` | probe: a fourth reason `VENDOR_DELAY` → `INVALID_INTERNAL_REASON`; `OTHER` with `'x'` → `DETAIL_REQUIRED` |
| Database | `waits_internal_reason_check` CHECK constraint | probe: a **direct table insert** with `VENDOR_DELAY` → `violates check constraint` |

That third row is the important one — enforcement is not UI-only, and not even RPC-only.

### A defect this work introduced and caught

Adding `p_internal_reason` changed `enter_waiting`'s arity, so `create or
replace` did **not** replace the old function — it created a **second
overload** with no INTERNAL enforcement, and made 3-argument calls ambiguous.
Caught by the live verification probe, not by CI. Dropped in the same
migration. The CHECK constraint would still have refused the resulting row, so
it failed closed rather than open — but a second door that is merely locked is
still a second door.

### 24-hour escalation

The **same** 24h branch now serves both wait types. No second engine, no
changed threshold. Only the clock start differs, and that is forced by the data
model rather than chosen: EXTERNAL measures from `resume_ready_at`; INTERNAL
has no resume-ready state by design (`mark_wait_resolved` still refuses
non-EXTERNAL waits), so it measures from `entered_at`.

Live proof, on a wait backdated 25 hours:

| Check | Result |
|---|---|
| INTERNAL wait escalates | 0 → **2** notifications (owner + Manager, deduped per RISK-26) |
| `last_escalated_at` stamped | yes |
| Repeated scan | 2 → **2** — idempotent, no duplicate |
| Wait resolved by escalation? | **no — still unresolved (correct)** |

Escalation notifies. It never grants the approval, releases the PO, or settles
an "Other". Authority stays with the real actor — the same boundary already
enforced for Production and QC.

### Purchase authority boundary

Maintenance records the dependency and its escalation state. It creates no
Purchase Order, releases none, fabricates no approval, and mutates no
Purchase-system truth. The wait row stores `internal_reason` and
`dependency_ref` and nothing that could be mistaken for PO status.

### Audit

`enter_waiting` writes both a `case_events` row and an `audit_log` row carrying
the actor, the timestamp, the reason type and the internal reason. Verified by
test: exactly one audit row, actor = the entering staff member, and
`after.internal_reason` = the reason given.

---

## C. Test-data forensic report

### Before cleanup

| Metric | Count |
|---|---|
| Total cases | 9,214 |
| Cases whose symptom starts with `[AUTOTEST` | **9,214** |
| Cases **not** provably synthetic | **0** |
| Open cases | 9,009 |

**Classification method.** Prefix-anchored `symptom like '[AUTOTEST%'` — not
`'%[AUTOTEST%'`, which would also match a real symptom that merely mentioned
the word. The prefix is generated by repository test code (`tests/helpers.ts`
returns `[AUTOTEST] …`, `e2e/helpers.ts` returns `[AUTOTEST-E2E] …`), which is
the brief's §13 "creation pattern explicitly proven by repository test code".

**No case was classified by age, status, assignment, or how it looked.**

### Safety model established before any deletion

| Finding | Consequence |
|---|---|
| **0 DELETE policies** in the whole schema | no client can delete anything; cleanup must be SECURITY DEFINER |
| All **21** FKs to `cases` are `NO ACTION` | nothing cascades accidentally; every dependent row must be removed explicitly, in order |
| `audit_log` has **no FK** to `cases` | its rows would dangle unless removed deliberately |
| `recurrence_flags.related_case_ids` is an **array** | a flag on case A can reference case B — a shared, not exclusive, reference |
| No existing cleanup helper | one had to be built (§18), not duplicated |

**On the append-only rule.** `CLAUDE.md` states `case_events`/`audit_log` are
append-only and business history is never deleted. That rule protects
*business* history, and this database contains none — 9,214 of 9,214 rows are
test fixtures. Rather than rely on that reasoning holding in future, the
function is built so it **cannot** touch a non-synthetic case even if one is
passed to it. The safety lives in the code, not in the caller's care.

### The guards, and proof each one fires

| Guard | Live result |
|---|---|
| non-existent id | `CLEANUP_REFUSED: 1 of 1 ids do not exist` |
| **case not provably synthetic** | `CLEANUP_REFUSED: 1 case(s) are not provably synthetic` |
| case referenced by a `pm_instances` row | `CLEANUP_REFUSED: … not exclusively theirs` |
| case is the primary of a duplicate outside the batch | `CLEANUP_REFUSED: … primary of a duplicate outside this batch` |
| case referenced by a surviving recurrence flag | guard present; no such case existed to trip it |

The second guard was proven with a temporary fixture: a case with the symptom
`REAL BUSINESS CASE - guard proof fixture` was created, the function **refused
to delete it**, and the fixture was then removed directly in the same
transaction so the database was never left holding a fake "real" record.

A **single-case trial** ran before any bulk work: exactly 1 case removed, its 1
event removed, total cases 9,242 → 9,241, staff count unchanged.

### The 10 retained, and why

One per distinct open lifecycle state, choosing the case in each state with the
most linked records:

| Case | State | Why it earns its place |
|---|---|---|
| MC-000009 | MAINTENANCE_RELEASED | richest case in the set; full QC-cleared journey |
| MC-007774 | CLEARANCE_PENDING | awaiting QC — the F-01 audit-trail exhibit |
| MC-007887 | QC_REJECTED | QC rejection path |
| MC-000013 | TECHNICALLY_RESTORED | temporary→technical restoration |
| MC-000014 | IN_REPAIR | restoration **verification failure** path |
| MC-000026 | DIAGNOSING | mid-lifecycle |
| MC-000016 | ASSIGNED | assignment/ownership |
| MC-000031 | ASSESSED | LOW priority |
| MC-000170 | REPORTED | spare flow |
| MC-000077 | ACKNOWLEDGED, HIGH, emergency confirmed, **unowned** | the RISK-26 duplicate-notification exhibit *and* the RISK-27 unclaimable-case exhibit |

No case was created to reach 10.

### After cleanup

| Metric | Count |
|---|---|
| Cases deleted | **8,920** |
| Total cases remaining | 321 |
| Open cases remaining | 114 |
| Non-open (CLOSED/REJECTED/DUPLICATE) — **deliberately untouched** per §16 | 207 |
| Cases not provably synthetic | **0** (unchanged — none existed, none created) |
| Staff / auth users / PM plans / recurrence rules | unchanged |

### Why 114 open remain and not 10 — safety over the number

Full accounting, **zero unexplained**:

| Reason | Count |
|---|---|
| Retained by choice | 10 |
| Blocked: referenced by a `pm_instances` row | 1 |
| Blocked: is the primary of a DUPLICATE case | 103 |
| **Unexplained** | **0** |

The 103 are open cases that a **DUPLICATE-status** case points at. Deleting
them would require deleting those DUPLICATE (resolved) cases too — which §16
explicitly forbids, and which §31 Question 2 rules out. **The brief's own rule
that safety outranks the number 10 is why the number is 114.** If you want
those 103 gone as well, that needs your explicit approval to delete the linked
resolved cases, which is outside this brief's stated scope.

### Integrity after cleanup

Zero orphans, checked across every dependent table:

`case_events` 0 · `observations` 0 · `notifications` 0 · `spare_usage` 0 ·
`clearances` 0 · `waits` 0 · `evidence` 0 · `safety_stops` 0 ·
duplicates pointing at a missing primary **0** · `pm_instances` pointing at a
missing case **0** · recurrence flags referencing a missing case **0**.

### Stopping the refill (§21)

The one-off cleanup would have been undone within a day, so the underlying
problem is fixed too: a vitest `globalSetup` teardown removes only the
synthetic cases created **during that run's window**, once per suite. No
existing test was changed and no coverage was weakened to make cleanup easier.

`cleanup_synthetic_cases` keeps EXECUTE revoked from every client role. The
only client-reachable entry point is `cleanup_test_cases_since`, which is
staff-only, demands an explicit start timestamp (it can never mean "clean
everything"), refuses a window wider than 24 hours, and delegates every
deletion to the guarded function — so even a malicious staff account could only
ever remove `[AUTOTEST`-prefixed fixtures. In a production database with no
synthetic cases it is inert.

**Honest limitation:** vitest's teardown is not told whether the run passed, so
failed-run retention is **opt-in** (`MAINTENANCE_KEEP_TEST_DATA=1`) rather than
automatic. Stated rather than implied.

---

## D. Test report

| Suite | Result |
|---|---|
| `tsc` | clean |
| `npm run lint` | clean |
| `npm run build` | clean |
| `"use client"` boundary re-scan (36 files) | clean |
| New: `tests/risk25-internal-waiting.test.ts` | 10 tests |
| New: `tests/cleanup-safety.test.ts` | 7 tests |
| Updated: `tests/escalation-coverage.test.ts` | RISK-25 block rewritten from "pinned defect" to "pinned resolution" |
| Updated: 3 existing INTERNAL-wait call sites | now pass a reason |

CI is the source of truth for execution; this sandbox cannot reach Supabase
(RISK-05).

**Not hidden:** the "a non-synthetic case is refused" guard has **no vitest
test**. Proving it from a test would mean creating a case without the
`[AUTOTEST` prefix — and since no client can delete one, that row would live in
the database forever, defeating the cleanup this suite supports. It was proven
live instead, with the temporary fixture described in §C.

---

## E. Files changed

| File | Why |
|---|---|
| `0036_…_synthetic_test_data_cleanup.sql` | the guarded cleanup function; no client can call it |
| `0037_…_risk25_internal_wait_reasons.sql` | three reasons: column, CHECK constraint, RPC enforcement, and the stale-overload drop |
| `0038_…_risk25_internal_wait_escalation.sql` | INTERNAL waits join the existing 24h branch |
| `0039_…_test_run_self_cleanup.sql` | the narrow, staff-only, windowed entry point for §21 |
| `waiting-form.tsx` | three INTERNAL choices + the Purchase-boundary note |
| `vitest.config.ts`, `tests/global-teardown.ts` | per-run self-cleanup |
| `tests/risk25-internal-waiting.test.ts`, `tests/cleanup-safety.test.ts` | new coverage |
| `tests/escalation-coverage.test.ts` + 2 others | RISK-25 is resolved; INTERNAL calls need a reason |

---

## Open with you

1. **QC identities — answered, no action needed.** The QC login will come from
   the Quality module at integration. Noted from the attachment: that module is
   currently a standalone localStorage prototype with roles `exec`/`mgr`/`head`
   and `canApprove = mgr || head`. It is **not on shared Supabase auth yet**, so
   integration needs that first. `maintenance.qc_authority` staying empty is now
   a recorded decision rather than an open question.
2. **Leaked-password protection** — deferred by you to last.
3. **The 103 duplicate-primary cases** — need your call, see §C.
4. **Sarvam Screen Architecture document** — needed to action §4/§5/§27.
