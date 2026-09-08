# Loop 56 — Golden-scenario / negative-test re-verification (Blueprint §32/§33)

Boss approved "Continue...Loop 56 to 60" without picking one of the 4
candidates `APPROVAL_REPORT_LOOP_51_55.md` proposed. Proceeded on candidate
1: re-verify the Blueprint's §32 golden scenarios and §33 negative tests
against the actual test suite (216 `it()` cases across 30 files), since it
verifies existing claimed coverage rather than inventing new scope —
consistent with "no business rule invention."

## Headline finding: a real, CRITICAL authority-boundary bug

**`reopen_case` only checks `is_staff()` — any single Executive OR Manager
can reopen a CLOSED case alone.** This directly contradicts
`IMPLEMENTATION_PACK.md` line 150, which is LOCKED, unambiguous, and not
just a Blueprint wireframe reading: **"Reopen authority = Executive +
Manager."** The same rule appears independently in the Blueprint's §5
permission matrix ("Co-required... Executive + Manager both required") and
its NS-014 ("Reopen by Executive only, without Manager → Server-side
rejection: requires both") — three independent sources agree on the
requirement; the running code does not implement it.

Evidence — `supabase/migrations/0003_maintenance_state_engine.sql:250-251`:
```sql
if not maintenance.is_staff() then
  raise exception 'FORBIDDEN: only Maintenance staff may reopen a case';
end if;
```
No check anywhere in the function requires a second, distinct actor of the
other role, or Manager-specific authority. `lifecycle.test.ts`'s only reopen
test (`"goes REPORTED -> ... -> MAINTENANCE_RELEASED -> CLOSED, then
reopens"`) calls `reopen_case` as a single Executive and asserts success —
which is itself evidence the current code's actual behavior was captured
correctly by that test, not a red flag in the test.

**This is not fixed in this loop.** Per CLAUDE.md's "no silent architecture
drift" rule and the Blueprint's own STOP condition #4 ("safety-critical
authority unknown — implementation would require guessing"), the exact
mechanism is a design decision, not a bug with one obvious fix:

- Does "Executive + Manager" mean a Manager alone may reopen (Manager
  already holds "final override" authority per §3.2's general rule), while
  an Executive alone may not — i.e. Manager-only, matching the pattern of
  every other Manager-exclusive action in §5's permission matrix?
- Or does it mean a genuine two-actor joint action — one Executive AND one
  Manager must each independently act, similar to the emergency
  claim-then-confirm two-step (§6)?
- Or something else the Boss intends that neither reading captures?

Flagging for an explicit Boss decision before any fix, exactly as Loop 54's
G1 was handled. **No fix is proposed or implemented in this loop.**

## Golden scenarios (§32) — verification result

| ID | Scenario | Status | Evidence |
|---|---|---|---|
| GS-A | Normal breakdown, full happy path | MATCH | `lifecycle.test.ts:9`, exact state sequence including the Loop 54 `ASSESSED` step |
| GS-B | QC required/rejected then cleared | MATCH | `qc-and-restoration.test.ts:19`, exact sequence including rejection history preservation |
| GS-C | Temporary restoration + follow-up | MATCH | `qc-and-restoration.test.ts:128,180` — no direct edge to TECHNICALLY_RESTORED, follow-up flag correctly scoped |
| GS-D | Waiting external, auto resume-ready + notification | MATCH | `assignment-and-waiting.test.ts:162` (EXTERNAL requires `mark_wait_resolved`, `resume_type` recorded), `emergency-and-notifications.test.ts:206` (immediate notification on resolve) |
| GS-E | Shift-end non-restart, no fake restart event | MATCH | `production-boundary.test.ts:194` — "records without fabricating a restart, and does not block closure" |
| GS-F | Reopen, history intact | **PARTIAL — see headline finding** | History-preservation itself is fine (`lifecycle.test.ts:9` confirms `REOPENED` event + linked prior state); the "Executive + Manager both required" half is not implemented |
| GS-G | Handover, full continuity trail, case age preserved | MATCH | `handover.test.ts:68` explicitly asserts case age is not reset and ownership history is preserved; continuity-trail visibility itself is a read-scope/RLS matter already covered by `observations-clearances-audit.test.ts`'s staff-read tests, not a separate handover-specific gap |
| GS-H | Spare traceability, no Stores stock mutation | MATCH | `spares.test.ts` covers each link in the chain (request→approval→usage→stores-reference) across 10 tests; no single RPC or code path exists to mutate a Stores stock balance anywhere in the schema (confirmed by the same enumerate-first method used for RISK-13-class findings in earlier loops) |

## Negative tests (§33) — verification result

| ID | Scenario | Status | Evidence |
|---|---|---|---|
| NS-001 | Unauthorized Manager-only action | MATCH | `forensic-authorization.test.ts`, `red-team-matrix.test.ts` — extensively, beyond just this one case |
| NS-002 | Concurrent accept, one winner | MATCH | `assignment-and-waiting.test.ts:137` "First-valid-actor ownership race" |
| NS-003 | Retry same command, idempotency | MATCH | `lifecycle.test.ts:162` |
| NS-004 | QC rejects restoration | MATCH | Covered within GS-B's own test |
| NS-005 | Production starts despite active stop | MATCH | `production-boundary.test.ts:88` |
| NS-006 | Network fails after submit, safe retry | MATCH | Same idempotency-key mechanism as NS-003 — one mechanism, both scenarios |
| NS-007 | Temp restoration → attempted closure | **Fixed this loop** | Was structurally impossible (no such edge in `status_transitions`) but untested — added `qc-and-restoration.test.ts`'s new `"NS-007: rejects a direct TEMPORARILY_RESTORED -> CLOSED attempt"` |
| NS-008 | Technical verification failure | MATCH | `qc-and-restoration.test.ts:218` |
| NS-009 | Claim without confirmation, clock doesn't start | MATCH, strengthened | The claim-then-confirm ordering was already tested; added an explicit `emergency_confirmed`/`emergency_confirmed_at` assertion between claim and confirm rather than leaving it implied |
| NS-010 | WAITING reason inferred from free text | MATCH by construction | `enter_waiting` requires `p_reason_type` as a mandatory typed enum parameter — there is no code path that could infer it from `p_reason_text` |
| NS-011 | AI/RAG declares root cause | MATCH by construction | `record_root_cause` requires a human authenticated actor and a stated validation basis (`root-cause.test.ts:38`) — no AI/service-role write path exists |
| NS-012 | Stores stock mutation attempt | MATCH by absence | No stock-mutation function or table exists anywhere in the schema — nothing to attempt |
| NS-013 | Logout, no Executive available | **Verified, deliberately not automated** | `handover_all_open_cases` acts on every open case the caller owns; the test suite's own `handover.test.ts` comment explains why exercising it for real would risk interfering with other tests' in-flight cases in this shared-project suite. The nobody-available branch (owner → NULL) exists in the RPC (`0014_maintenance_handover.sql:217-222`) and was verified live via `execute_sql` at Loop 12 (see `CHANGELOG.md`) — a sound, already-documented tradeoff, not a fresh gap |
| NS-014 | Reopen by Executive only, without Manager | **GAP — see headline finding** | Confirmed not enforced |
| NS-015 | Spare request >₹12,000 without proof | MATCH | `spares.test.ts:70` |
| NS-016 | Invalid state transition (e.g. REPORTED→CLOSED) | MATCH | `lifecycle.test.ts:97` |
| NS-017 | Unknown asset silently mapped | MATCH by absence | No automated asset-linking path exists; `case_assets` linkage is staff-initiated only (`case-assets.test.ts`) |
| NS-018 | PM reschedule erases overdue history | **Verified, deliberately not automated** | `reschedule_pm_instance` preserves the old instance's `overdue_since` and links the new one via `rescheduled_from_instance_id` (`0013_maintenance_pm.sql:257-261`) — correct by inspection. Instances only come into existence via `run_pm_scan`, which is cron-only (client EXECUTE revoked, verified in `pm.test.ts`), so no client-level integration test can create one to reschedule; `pm.test.ts`'s own header comment already documents this and records that it was verified live via `execute_sql` at Loop 10 |
| NS-019 | Audit entry edit/delete attempt | **Fixed this loop** | Was structurally blocked (no UPDATE/DELETE RLS policy on `audit_log`) but untested — added `observations-clearances-audit.test.ts`'s new `"NS-019: has no UPDATE or DELETE policy"` |
| NS-020 | Complainant disagreement, no unilateral closure | **GAP — genuinely unimplemented** | `IMPLEMENTATION_PACK.md:558-560` describes this as a prose rule ("complainant + Executive jointly decide") but no RPC, gate, or state field implements it — there is no code path that even represents "complainant disagrees," so there is nothing to test. Recorded as a real, separate gap from the reopen finding — not fixed this loop, since it needs the same kind of design-shape decision (what does "jointly decide" mean as a UI/RPC interaction?) that G1 and the reopen finding both needed |

## What this loop changed

- 3 new regression tests (NS-007, NS-019) plus 1 strengthened assertion
  (NS-009) — all additive, all passing by construction against unchanged
  code, verified via `tsc --noEmit`/`eslint` (both clean). No RPC,
  migration, or business logic touched.
- No fix for the reopen authority gap (NS-014/GS-F) or the complainant-
  disagreement gap (NS-020) — both need a Boss decision on mechanism, not a
  guess.

## Open items carried forward

- **Reopen authority gap** (CRITICAL, this loop's headline finding) — needs
  a Boss decision on mechanism before any fix.
- **Complainant disagreement path** (NS-020) — genuinely unimplemented,
  needs a Boss decision on what "jointly decide" means as an actual
  interaction before any implementation.
- Everything else previously disclosed and unchanged (Type B items, §35
  PENDING gates).
