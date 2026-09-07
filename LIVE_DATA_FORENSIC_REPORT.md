# LIVE DATA FORENSIC REPORT

Read-only diagnostics against Supabase project `maavrlqkdrisjwzhjdgg`,
2026-09-07. **No data was mutated during this phase.** No secrets appear below.

## Environment identification — answered first, as required

| Question | Answer |
|---|---|
| Is this test/staging or production? | **Both.** It is the project the deployed Vercel production app uses *and* the project CI writes to |
| Is it the actual production Supabase project? | Yes — `src/lib/supabase/config.ts` defaults to it and `.env.local` points at it |
| Which tests create persistent records? | Both suites. `tests/helpers.ts` tags cases `[AUTOTEST]`; `e2e/helpers.ts` tags `[AUTOTEST-E2E]` |
| Is CI/E2E pointing at this environment? | Yes — the GitHub Actions runner writes here on every push |
| Is cleanup/rollback missing? | Yes, and deliberately: `tests/README.md` records that no DELETE policy exists on `cases` or any audit table, per the append-only history rule (§27). Automated cleanup was never attempted |

## Inventory

| Metric | Count | Query |
|---|---:|---|
| Total cases | 7,592 | `count(*) from maintenance.cases` |
| `[AUTOTEST]` (vitest) | 7,284 | `symptom like '%[AUTOTEST]%'` |
| `[AUTOTEST-E2E]` (Playwright) | 291 | `symptom like '%[AUTOTEST-E2E]%'` |
| `[AUTOTEST-L##]` (loop verification) | 17 | `symptom like '%[AUTOTEST%'` minus the two above |
| **Untagged / real business cases** | **0** | `symptom not like '%[AUTOTEST%'` |
| Case events | 19,493 | |
| Audit rows | 19,304 | |
| Staff identities | 2 | |
| Case date range | 2026-09-06 09:42 → 2026-09-07 11:57 | |

**Headline: there is no production data to protect. Every one of the 7,592
cases is test-generated and all 7,592 are accounted for by a tag.** The
untagged count is exactly zero. Nothing operational has been corrupted, mixed,
or lost — the contamination risk is entirely about what happens the day real
data arrives.

## Anomalies

| # | Issue | Count | Sample | Classification | Current code can reproduce? | Recommendation |
|---|---|---:|---|---|---|---|
| 1 | `CLOSED` with no `maintenance_released_at` | 1 | `6e9c4c0b…` — `[AUTOTEST-L27] fabricate closed case dir…` | **AUTOTEST** — the deliberate exploit-proof row from Loop 27's RISK-19 demonstration | **No.** Migration 0026 pinned 34 columns on `cases_insert`; this row predates it by ~4 min | Leave. It is evidence of a closed vulnerability |
| 2 | `MAINTENANCE_RELEASED`/`CLOSED` with no `technically_restored_at` | 2 | `0c3e528d…` `[AUTOTEST] QC gate regression fix check` (+ the row above) | **LEGACY** — its entire history is one `STATUS_TRANSITION` jumping straight to `MAINTENANCE_RELEASED`; the RISK-11 regression 0012 fixed | **No.** `DB VERIFIED`: the live `status_transitions` graph has no edge into `MAINTENANCE_RELEASED` except from `TECHNICALLY_RESTORED` or `CLEARANCE_PENDING` | Leave; regression covered by 0012 + tests |
| 3 | Spare usage with no linked request | 151 | latest `used_at 2026-09-07 02:41:07` | **LEGACY** — migration 0028 made request linkage mandatory at `02:43:03` | **No** | Leave |
| 4 | Orphan case events | 0 | — | clean | — | — |
| 5 | Orphan spare usage | 0 | — | clean | — | — |
| 6 | Duplicate active waits | 0 | — | clean | — | — |
| 7 | Duplicate active safety stops | 0 | — | clean | — | — |
| 8 | Duplicate pending clearances | 0 | — | clean | — | — |
| 9 | `CLEARED` clearance whose case is not released | 0 | — | clean | — | — |
| 10 | **Cases with zero events AND zero audit rows** | **2,686** | newest `2026-09-07 11:55:32` | **CURRENT-CODE-CREATED** | **Yes** — see below | Raised for Boss decision; not fixed unilaterally |

### Anomaly 10 — the only one current code still produces

A case is created by a **direct client insert**
(`src/app/(app)/cases/new/page.tsx` → `.from("cases").insert(...)`), not by an
RPC. Only the RPCs write `case_events` and `audit_log`, so a reported case that
nobody has acted on yet leaves **no event and no audit row at all** — 2,686 of
7,592 cases are in that state, and the newest was created minutes before this
audit.

The case row itself carries `reporter_user_id` and `created_at`, so the *fact*
of creation is recorded. Whether that satisfies §43.3 ("every material action is
auditable") for the act that originates the entire record is a contract reading,
not an engineering call — so it is reported here rather than silently changed.
Adding a `CASE_REPORTED` event + audit row on creation would close it; that is a
one-migration change awaiting the Boss's answer.

## Destructive cleanup — not proposed

No deletion is recommended and none was performed. Deleting 7,592 rows from a
database that contains zero real records solves nothing and risks the only
thing present. The defect worth fixing is the *shared environment*, not the
rows — see F-05 remediation.
