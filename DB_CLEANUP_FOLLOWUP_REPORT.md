# Follow-up Test Data Cleanup — Boss-approved (items 4 & 6)

Boss's instructions this round:
- **Item 6** (verbatim): "inko agar bina project ko nuksaan pahoche delete kar sakte ho aur koi jarurat na ho to delete kardo" — the 103 open cases blocked by a DUPLICATE case pointing at them.
- **Item 4** (verbatim): "Test data agar ab kisi kaam ka na ho to nikal do, delete kardo agar Project ko koi nuksan nahi hai aur is data ka ab koi Kam nahi hai to" — any other stale test data, if harmless.

No migration file for this — no new deletion logic was written. Both actions call the **existing, already-audited** `maintenance.cleanup_synthetic_cases(uuid[])` function (created in migration 0046, unchanged), which independently refuses a batch that isn't provably synthetic, is referenced by `pm_instances`, has an external DUPLICATE pointer, or is referenced by a surviving `recurrence_flags` row. Nothing here bypassed or weakened that function. Executed via `mcp__Supabase__execute_sql` directly against project `maavrlqkdrisjwzhjdgg`.

## Item 6 — the 103 DUPLICATE-blocked cases

**Why they survived every prior cleanup**: `cleanup_test_cases_since` (the routine, run-tag-scoped cleanup that runs after every CI test suite) explicitly excludes any case that a `DUPLICATE` row points at (`not exists (select 1 from maintenance.cases d where d.duplicate_of_case_id = c.id)`), and only ever looks at cases from the last 24h anyway — this is a *2026-09-06* historical batch, permanently outside that window. `cleanup_synthetic_cases` itself would also refuse a primary passed alone (`CLEANUP_REFUSED: N case(s) are the primary of a duplicate outside this batch`) — the fix was simply to pass the DUPLICATE row and its primary **together** in one batch, which the function already handles correctly (it deletes rows `where duplicate_of_case_id is not null` first, then the rest — children before parents, no FK violation).

**Enumeration (before deleting anything):**

| Check | Result |
|---|---|
| DUPLICATE-status cases | 103 |
| Distinct primaries they point to | 103 (clean 1:1 pairing, no duplicate-of-duplicate chains) |
| Combined ids (103 + 103) | 206 |
| Non-synthetic in this set (`symptom not like '[AUTOTEST%'`) | **0** |
| Referenced by `pm_instances` | **0** |
| Any DUPLICATE outside this batch pointing at one of these 206 | **0** |
| Referenced by `recurrence_flags` (own or `related_case_ids`) | **0** |

All primaries were in status `REPORTED` — none of them were themselves resolved/terminal cases; they were simply unreachable because the routine cleanup's own safety exclusion (rightly) never attempts a case a DUPLICATE still points at.

**Action**: `select maintenance.cleanup_synthetic_cases(array_agg(id)) from (...206 ids...)` → `{"requested": 206, "deleted_cases": 103}`. (The function's own `get diagnostics` only counts the row count of its *second* DELETE statement — the 103 DUPLICATE rows are removed by the *first* DELETE inside the same call. Verified actual total removed = 206 by re-querying case counts before/after: 328 → 122.)

## Item 4 — remaining stale test data

After item 6, 122 cases remained: 114 matching the standard `[AUTOTEST]` prefix, and 8 that my first pass mis-classified as "non-synthetic" because they used an **older tag convention** (`[AUTOTEST-L27]`, `[AUTOTEST-R25]` — leaked artifacts from Loop 27 and a RISK-25 test, predating the `[AUTOTEST]`+`[run=tag]` standardization introduced in Loop 41) rather than the literal `[AUTOTEST]` prefix. `cleanup_synthetic_cases`'s own guard (`symptom not like '[AUTOTEST%'`) correctly recognises both forms as synthetic — my first manual check used a narrower pattern (`'[AUTOTEST]%'`) than the function's own (`'[AUTOTEST%'`), which is why I caught and corrected this before reporting it as done.

**114-case batch** (the historical 2026-09-06 seed data, outside the 24h routine-cleanup window, mostly `REJECTED` false-complaint-closed demo cases plus a handful of one-off mid-lifecycle singletons):

| Check | Result |
|---|---|
| pm_instances refs | 0 |
| still pointed at by a duplicate | 0 |
| recurrence_flags refs (own/related) | 0 |

→ `cleanup_synthetic_cases`: `{"requested": 114, "deleted_cases": 114}`.

**8-case batch** (`[AUTOTEST-L27]`/`[AUTOTEST-R25]` leaked test artifacts):

| Check | Result |
|---|---|
| Any case in the whole `cases` table NOT matching `'[AUTOTEST%'` after this batch | **0** (confirms zero real/production data exists anywhere — expected, this project hasn't launched) |
| pm_instances / duplicate / recurrence_flags refs | 0 / 0 / 0 |

→ `cleanup_synthetic_cases`: `{"requested": 8, "deleted_cases": 8}`.

## Final state (verified, not assumed)

```
maintenance.cases            0
maintenance.pm_plans         0
maintenance.recurrence_rules 0
maintenance.staff            2   (untouched — real demo login identities)
auth.users                   4   (untouched)

Orphan sweep after all three deletions:
  dangling audit_log rows (target_table='maintenance.cases')  0
  orphan case_events                                          0
  orphan notifications                                        0
  orphan evidence                                              0
  orphan case_assignments                                     0
  orphan waits                                                0
  orphan spare_requests                                       0
  orphan recurrence_flags                                     0
```

**Net effect**: the database now has zero cases, zero PM plans, zero recurrence rules — a genuinely clean slate. Only the 2 staff rows and 4 auth identities (the demo login accounts documented in STATUS.md) remain. Nothing forced past a guard refusal at any point; every deletion went through the same already-reviewed `cleanup_synthetic_cases` function used in the original Loop 45/46 backlog cleanup, called only after independently re-verifying its own preconditions first.

**Consequence worth flagging, not hiding**: the app's dashboards (Control Tower, `/dashboard`, `/kpi`) will now show all-zero/empty states until new cases are created — this is expected and correct given the data is gone, not a bug. First real (or new demo) case creation repopulates everything from empty, the same as verified after the original Loop 45/46 cleanup.
