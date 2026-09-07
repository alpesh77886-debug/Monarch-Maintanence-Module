# MONARCH Maintenance — Forensic Remediation Final

Scope: the P0/P1/P2 fix pack against HEAD `bcf4b93`. Companion documents:
`FORENSIC_REMEDIATION_RECON.md` (Phase 1), `AUTHORITY_MATRIX.md` (Phase 2),
`LIVE_DATA_FORENSIC_REPORT.md` (§15).

## 1. Executive Verdict

The critical finding was real and is now closed. `qc_decision` allowed any
Maintenance Executive or Manager to make the final QC clearance decision — the
complete self-clearing loop `Maintenance → send_to_qc → Maintenance → CLEARED`
was reachable in the running system, against three separate explicit statements
in the locked pack. It now fails closed for every Maintenance identity, verified
live against four real identities.

Three read-authorization holes (`cases`, `evidence`, `safety_stops`,
`production_boundary_events` — four policies, three findings) were also real:
any authenticated account, including one with no Maintenance role at all, could
read the entire plant's work list, all evidence, all safety-stop reasons and all
production-boundary detail. All four are now scoped, verified live by counting
what each of four identities can actually see.

**The database contains no real business data.** All 7,592 cases are
test-generated; the untagged count is exactly zero. The "live data
contamination" finding is therefore not a loss event — it is a forward-looking
defect in that one Supabase project serves both production and CI.

**Verdict: NOT READY.** Not because engineering is unfinished, but because three
things the Boss alone can supply are missing — see §16. The security posture is
materially better than before this work; it is not yet operable with real data.

## 2. Findings Closed

| ID | Sev | Finding | Status | Evidence |
|---|---|---|---|---|
| F-01 | CRITICAL | Maintenance staff could make final QC decisions | **CLOSED** | `DB VERIFIED` — four-identity live probe: Executive → `FORBIDDEN … does not own QC clearance`; Manager → same; non-staff without grant → `FORBIDDEN … granted QC authority`; granted QC identity → passed both gates. Migration 0031 |
| F-02 | HIGH | `cases_select USING (true)` | **CLOSED** | `RLS VERIFIED` — an unrelated authenticated identity now sees **0** of 7,592 cases (was all 7,592). Staff still see all; reporter and assigned technician still see theirs. Migration 0032 |
| F-03 | HIGH | `evidence_select USING (true)` | **CLOSED** | `RLS VERIFIED` — unrelated identity sees **0** of 211 (was 211). Migration 0032 |
| F-04 | HIGH | `safety_stops` / `production_boundary_events` open reads | **CLOSED** | `RLS VERIFIED` — unrelated identity sees **0/0** (was 355 and 138). Write policies confirmed unchanged (`with_check false`). Migration 0032 |
| F-06 | MEDIUM | Historical anomalies unclassified | **CLOSED** | `DB VERIFIED` — every anomaly classified and reproducibility tested against the live transition graph and migration timeline. See `LIVE_DATA_FORENSIC_REPORT.md`. No history rewritten |
| F-07 | MEDIUM | Stale lifecycle vocabulary | **CLOSED** | `CODE VERIFIED` — one file (`dashboard/page.tsx`). Dead `WAITING`/`QC_PENDING` keys removed; the eight real statuses that were silently rendering as one grey are now covered. All 16 enum values mapped |
| F-08a | MEDIUM | `is_manager` / `is_staff` mutable `search_path` | **CLOSED** | Migration 0033 — `search_path` pinned, bodies byte-identical |
| F-09 | MEDIUM | Index debt | **CLOSED** | Migration 0033 — exactly three indexes added (`evidence`, `capa_links`, `case_assets` on `case_id`), the only missing ones the case-detail page actually filters by. `notifications`/`idempotency_keys`/`pm_instances` deliberately **not** indexed — they are not filtered by `case_id` |
| F-10 | MEDIUM | Dashboard over-fetching | **MEASURED** | Already handled: `explain analyze` 6.783 ms; the real cost was region + sequential queries, fixed earlier today (CI e2e 125–156 s → 66–80 s). Residual app-side aggregation documented as a scale risk in §15 |

## 3. Findings Remaining

| ID | Sev | Reason it is not closed | Required next step (Boss) |
|---|---|---|---|
| F-01b | CRITICAL-adjacent | `maintenance.qc_authority` is **empty**. The boundary is enforced, but nobody can decide QC yet, so QC-required cases stop at `CLEARANCE_PENDING` | Name the real QC identities. §12 makes this evidence-controlled — it cannot be invented |
| F-05 | HIGH | One Supabase project serves production **and** CI. Explicit environment tagging is in place (suites now refuse to run without `MAINTENANCE_TEST_WRITES_OK=1`), but a dedicated test project is a spend decision | Approve a separate test project, or accept the tagging as sufficient |
| F-08b | MEDIUM | Leaked-password protection is still disabled. The Supabase MCP surface exposes no auth-config write tool | Enable it in the Supabase dashboard (Auth → Password security) |
| NEW-01 | MEDIUM | 2,686 cases have zero events **and** zero audit rows, because case creation is a direct insert rather than an RPC. Reproducible by current code | Decide whether case creation is a "material action" under §43.3. If yes, one migration adds a `CASE_REPORTED` event + audit row |
| RISK-04 / PENDING-03 | — | Granular per-field permission matrix still unsupplied (open since Loop 20) | Supply the matrix |
| RISK-02 / PENDING-01 | — | LOTO/PTW authority still unsupplied | Supply the evidence |
| PENDING-04 | — | Recurrence threshold/window still unsupplied; detection remains inert | Supply the values |

## 4. QC Authority Verification

`DB VERIFIED`, four real identities, live:

| Identity | Result |
|---|---|
| `exec1` (MAINTENANCE_EXECUTIVE) | `FORBIDDEN: Maintenance does not own QC clearance truth` |
| `mgr1` (MAINTENANCE_MANAGER) | `FORBIDDEN: Maintenance does not own QC clearance truth` |
| `tech1` (non-staff, no grant) | `FORBIDDEN: only an identity granted QC authority…` |
| `qc1` (non-staff, granted) | reached `CLEARANCE_NOT_FOUND` — both gates opened |

The refusal is **structural, not merely an omitted grant**: `qc_decision`
refuses any `is_staff()` identity *before* consulting the allowlist, so adding a
Maintenance member to `qc_authority` still cannot recreate the self-clearing
loop. If the plant's real SOP permits one person to hold both hats, that is
evidence the Boss must supply — the code is deliberately fail-closed until then,
and the exact line to relax is commented in migration 0031.

`send_to_qc` was checked and left unchanged: Maintenance sending a case to QC is
contract-correct (§12).

## 5. RLS / Authorization Verification

`RLS VERIFIED` — rows visible per identity, measured live after the change:

| Identity | cases | evidence | safety_stops | production_boundary_events |
|---|---:|---:|---:|---:|
| Executive | 7,592 | 211 | 355 | 138 |
| Manager | 7,592 | 211 | 355 | 138 |
| `tech1` (non-staff) | 1,257 | 211 | **0** | **0** |
| `qc1` (unrelated) | **0** | **0** | **0** | **0** |
| *(before the fix, any authenticated identity)* | *7,592* | *211* | *355* | *138* |

One reading correction worth recording: `tech1` seeing all 211 evidence rows
initially looked like a leak. It is not — a direct check showed
`evidence_tech_must_not_see = 0`, i.e. every evidence row genuinely belongs to a
case `tech1` reported or is assigned to, because the evidence tests run as that
identity. The `qc1` row (0 across the board) is the discriminating negative.

## 6. Lifecycle Verification

`DB VERIFIED`. The live `status_transitions` graph admits `MAINTENANCE_RELEASED`
only from `TECHNICALLY_RESTORED` (gated on `qc_required = false`) or
`CLEARANCE_PENDING` (reachable only through `qc_decision`). No edge exists from
`REPORTED`. The historical case that reached `MAINTENANCE_RELEASED` in a single
transition is therefore not reproducible.

`WAITING` is confirmed as an overlay, not a status — it is not a value of
`maintenance.case_status` at all, and F-07's fix documents that in the one place
the UI implied otherwise.

## 7. Spare / ₹12k Verification

Unchanged and confirmed correct: `approve_spare_request` requires
`is_manager()`; `record_spare_usage` (0028) requires a linked request so the
>₹12,000 gate cannot be skipped by omitting a parameter. Not touched by this
remediation.

## 8. Emergency / Safety Verification

Unchanged and confirmed correct: `claim_emergency` is reporter-or-staff,
`confirm_emergency` is staff-only (§6 two-step preserved), `raise_safety_stop`
is staff-only and notifies every active Manager (0030). `safety_stops` write
policies remain `false` — RPC-only — and this remediation only narrowed reads.

## 9. WAITING Verification

No change made. `waits` was already `is_staff()`-scoped on read and RPC-driven
on write.

## 10. Audit / Idempotency Verification

`qc_decision` previously wrote a `case_event` but **no `audit_log` row at all**,
so the QC actor was absent from the audit trail. It now writes both. A repeat
decision is refused with `ALREADY_DECIDED`, so a retry creates neither a second
decision nor a second event. Regression tests assert exactly one audit row
carrying the QC actor's id and explicitly *not* the Maintenance actor's.

The audit gap in the opposite direction — case creation writing no audit row at
all — is NEW-01 above, reported not fixed.

## 11. Live Data Integrity

See `LIVE_DATA_FORENSIC_REPORT.md`. Summary: 7,592 cases, 0 real; 4 anomalous
rows, all classified, 3 of 4 not reproducible by current code; nothing deleted,
nothing rewritten.

## 12. UI Verification

`CODE VERIFIED` only. The QC panel no longer offers Clear/Reject to a
Maintenance user; it explains that QC owns the decision and the case waits.
The dashboard status map covers all 16 statuses.

**Not claimed: `LOCAL UI VERIFIED` or `AUTHENTICATED LIVE VERIFIED`.** This
sandbox cannot reach Supabase (RISK-05 egress block), so no authenticated screen
was driven by hand. That limitation is unchanged from every prior UI loop and is
stated rather than papered over.

## 13. Test Results

`tsc` clean · `npm run lint` clean · `npm run build` clean · full `"use client"`
boundary re-scan across 35 client files clean.

New suite `tests/forensic-authorization.test.ts` — 15 cases covering the F-01
authority matrix (4 identities), QC audit actor, QC idempotency + rejection
return path, F-02/03/04 read scope (staff / reporter / assignee / unrelated),
and F-04 write-protection preservation.

**Not yet claimed as `TEST VERIFIED`** — the suites cannot run in this sandbox;
CI is the source of truth and this section is updated from the actual CI run.

## 14. Deployment Verification

Migrations 0031/0032/0033 applied to the live project and verified by reading
back `pg_policies`, the function definitions and per-identity row counts.
Application deployment follows the normal PR → CI → Vercel path.

## 15. Known Limitations

1. **QC cannot be decided by anyone** until `maintenance.qc_authority` is
   populated. Fail-closed by design; blocking for the QC-required path.
2. **Production and CI share one Supabase project.** Mitigated by explicit
   acknowledgement tagging, not eliminated.
3. **Leaked-password protection remains off** — no MCP tool writes auth config.
4. **No authenticated UI verification** from this environment (RISK-05).
5. **Dashboard aggregates in application code.** Fine at 7,592 rows, not at
   100,000. Documented, deliberately not folded into a security fix.
6. **NEW-01**: case creation leaves no event or audit row.
7. Four PENDING items (LOTO/PTW, permission matrix, recurrence threshold, QC
   authority) remain evidence-controlled and were not invented.

## 16. Production Readiness Verdict

**NOT READY.**

Three specific things block it, none of them unfinished engineering:

1. `maintenance.qc_authority` is empty, so QC-required cases cannot complete.
2. One Supabase project serves both production and CI, so the first real case
   entered will sit alongside CI's test rows.
3. Leaked-password protection is disabled on the auth provider.

Each is a decision or credential only the Boss can supply. Once (1) and (3) are
done and (2) is either separated or explicitly accepted, the verdict moves to
`READY WITH EXPLICIT NON-BLOCKING LIMITATIONS` — the remaining items (4)–(7)
above are genuinely non-blocking.

A note on what this verdict is not: it is not a statement that the system got
worse. Before this remediation a Maintenance Executive could clear their own
QC gate and any authenticated account could read the whole plant's maintenance
history. Both are now closed. "NOT READY" reflects what is still required to
operate on real data, not the state of the code.
