# FORENSIC REMEDIATION — PHASE 1 RECONNAISSANCE

Mapped against HEAD `bcf4b93` on 2026-09-07. No code was modified during this
phase. Every claim below carries the evidence label that earned it
(§17 of the remediation brief). Nothing here is asserted from inspection
alone unless labelled `CODE VERIFIED`.

## Method

Migrations were read in order, but **live database state is treated as
authoritative** over migration files wherever the two could disagree
(a migration can be superseded by a later one). RLS policies, the
transition graph, function definitions and all data counts below were read
back from the live project `maavrlqkdrisjwzhjdgg` via read-only SQL.

---

## F-01 — QC decision authority — **CONFIRMED, CRITICAL**

`CODE VERIFIED` · `DB VERIFIED`

**Exact implementation.** `maintenance.qc_decision(p_clearance_id, p_decision,
p_reason)` — defined in `supabase/migrations/0007_maintenance_restoration_qc.sql`,
never redefined by any later migration (checked 0012, 0019, 0024). Its only
authority guard is:

```sql
if not maintenance.is_staff() then
  raise exception 'FORBIDDEN: only Maintenance staff may record a QC decision';
end if;
```

`is_staff()` is true for **any** `MAINTENANCE_EXECUTIVE` or
`MAINTENANCE_MANAGER`. So both Maintenance roles can set
`clearances.decision = 'CLEARED'` and drive the case to
`MAINTENANCE_RELEASED`. The full self-clearing loop
`Maintenance → send_to_qc → Maintenance → CLEARED` is reachable today.

**Locked requirement violated.** Three independent places in the pack:

| Pack ref | Text |
|---|---|
| §1 "Maintenance does NOT own" | "QC product disposition / clearance truth" |
| §43 item 8 | "QC truth remains QC-owned." |
| §19.15 | Claude Code MUST NOT autonomously "grant QC clearance" |

This is not an interpretation — the contract names QC clearance as
explicitly outside Maintenance's ownership, and the code grants it to
Maintenance.

**What is NOT broken.** Two adjacent controls were checked and are correct,
so the fix must not disturb them:

- `send_to_qc` correctly requires `is_staff()` **and** status
  `TECHNICALLY_RESTORED`. Maintenance sending a case to QC is contract-correct
  (§12 "Maintenance Executive: Send to QC").
- The direct `TECHNICALLY_RESTORED → MAINTENANCE_RELEASED` edge (the
  QC-not-required path) **is** properly gated in `transition_case`:
  it is blocked unless `qc_required` is explicitly `false`
  (`qc_required is distinct from false` → raise). NULL/undecided also blocks.
  Verified in `0012_maintenance_qc_gate_regression_fix.sql:66`.

So the defect is precisely and only the actor check inside `qc_decision`.

**The complication — why this is not a one-line fix.** The pack defines the
*prohibition* clearly but deliberately leaves the *positive* authority open:

| Pack ref | Text | Consequence |
|---|---|---|
| §12 | "Exact plant QC permit/authority remains evidence-controlled." | The QC actor identity is PENDING, not supplied |
| §3.1 | Software roles are `MAINTENANCE_EXECUTIVE` + `MAINTENANCE_MANAGER` only | No QC identity exists to grant it to |
| §33 | "V1 MUST NOT DEPEND ON — live QC API" | Cannot defer the decision to an external service |
| §32 item 10 | V1 must have "QC-required gate + manual Send-to-QC + rejection history" | Decisions must still be recordable in V1 |

`DB VERIFIED`: `maintenance.staff_role` is an enum of exactly two values.
No QC role, table, or identity model exists anywhere in the schema to reuse.

**Minimal safe fix.** Per the brief's own instruction — *"Reuse an existing QC
role/table/identity model if present. If none exists, implement only the
minimum safe integration/authorization seam. Do not invent plant-specific
permissions."* — the seam is an explicit, **empty-by-default, admin-granted
allowlist** of QC decision identities, separate from `maintenance.staff`:

- membership is not implied by any Maintenance role;
- it is granted out-of-band by the service role, exactly as `staff` rows are;
- `qc_decision` requires membership and otherwise fails closed;
- it invents no plant SOP, no permit mechanics, no role semantics — it is a
  list of user ids and nothing more.

**Operational consequence, stated plainly rather than buried:** until the Boss
populates that list, **no case can be QC-cleared**, and cases sent to QC will
sit in `CLEARANCE_PENDING`. That is the correct fail-closed behaviour for a
control the contract says Maintenance does not own — but it is a real change
to what the running application can do, and it is the Boss's call to accept it.
The QC-not-required path (`qc_required = false`) is unaffected and still
reaches `MAINTENANCE_RELEASED` normally.

**Tests required.** Executive cannot decide; Manager cannot decide; non-staff
cannot decide; granted QC identity can; rejection returns to repair state;
`transition_case` cannot bypass; audit records the real actor; retry is
idempotent.

---

## F-02 — `cases` read scope — **CONFIRMED, HIGH**

`DB VERIFIED` — read from `pg_policies` on the live project:

```
cases_select  SELECT  USING (true)
```

**Concrete impact** (`CODE VERIFIED`): `src/app/(app)/cases/page.tsx` selects
the 50 most recent cases with no owner/reporter filter. Any authenticated
user — including one with no `maintenance.staff` row — sees the entire
plant's work list: case numbers, symptoms, area, line, priority, owner.

**Scope determination — derived, not guessed.** Three constituencies must keep
working, each with pack backing:

| Identity | Needs | Evidence |
|---|---|---|
| Maintenance Executive / Manager | all cases | §22 shift dashboard needs "total open, Executive-wise pending/completed, unassigned"; the 0002 migration comment already states the intent as "All staff can see all open work" |
| Reporter | their own case | §5 reporter reports; §7 reporter is notified who acknowledged it — they must be able to follow it |
| Assigned technician | cases they are assigned to | §3.1 technicians hold "authenticated execution identities/permissions" and record interventions/observations against the case |

`DB VERIFIED`: `case_assignments_select` and `interventions_select` already use
`is_staff() OR <actor> = auth.uid()`, so this three-way shape is the pattern the
schema already follows elsewhere — it is not a new invention.

**Minimal safe fix.** One reusable predicate applied to `cases` and, by
inheritance, to the three tables below:

```
is_staff()
OR reporter_user_id = auth.uid()
OR EXISTS (an assignment on this case for auth.uid())
```

Anything narrower (e.g. staff-only) would strand reporters and assigned
technicians — a locked-workflow break, and therefore out of bounds.

---

## F-03 — `evidence` read scope — **CONFIRMED, HIGH**

`DB VERIFIED`: `evidence_select SELECT USING (true)`.

Insert is already correctly constrained (`with_check (uploaded_by = auth.uid())`).
Only the read side is open. Fix: evidence inherits its case's read scope, as the
brief prefers. No separate permission system.

---

## F-04 — `safety_stops` / `production_boundary_events` read scope — **CONFIRMED, HIGH**

`DB VERIFIED`:

| Table | SELECT | INSERT | UPDATE |
|---|---|---|---|
| `safety_stops` | `USING (true)` | `with_check (false)` | `USING (false)` |
| `production_boundary_events` | `USING (true)` | `with_check (false)` | — |

**Write protections are already correct and must not be weakened** — both are
RPC-only (`with_check false` means no direct client insert at all; only
SECURITY DEFINER functions write them). Only the read side is open, exposing
safety-stop reasons and production-boundary detail to any authenticated user.

Fix: same case-inheritance predicate. Write policies untouched.

---

## F-05 — live database test contamination — **CONFIRMED, but not the shape expected**

`DB VERIFIED` — read-only counts against the live project:

| Metric | Count |
|---|---|
| Total cases | 7,592 |
| `[AUTOTEST]` (vitest) | 7,284 |
| `[AUTOTEST-E2E]` (Playwright) | 291 |
| `[AUTOTEST-L##]` (loop verification runs) | 17 |
| **Untagged / real business cases** | **0** |
| Total case events | 19,493 |
| Total audit rows | 19,304 |
| Distinct staff identities | 2 |

**The finding is real but it is the opposite of "production data was polluted."
There is no production data. 100% of the 7,592 cases are test-generated** —
every row is accounted for by one of the three tags, and the untagged count is
exactly zero. Nothing operational has ever been lost, corrupted, or mixed.

**The mechanism is nevertheless a genuine defect** (`CODE VERIFIED`):
`src/lib/supabase/config.ts` defaults to `maavrlqkdrisjwzhjdgg`, and
`.env.local` points there too. **One Supabase project serves both the deployed
production application and CI.** The contamination risk is entirely
forward-looking: the day real cases are entered, the next CI run writes test
rows alongside them and every KPI figure becomes a blend of the two.

**No destructive cleanup is proposed and none should be done blind.** Per §6 of
the brief, environment identification comes first, and the honest answer is
that this project is currently *both* environments at once. That is the thing
to fix; deleting 7,592 rows from a database with no real data in it solves
nothing and risks the only thing there is.

---

## F-06 — historical data-integrity anomalies — **CONFIRMED, all classified**

`DB VERIFIED`. Every anomaly was classified by comparing its timestamp against
the migration that closed the corresponding hole, and by checking whether the
**current** code can still produce it.

| Anomaly | Count | Classification | Reproducible today? |
|---|---:|---|---|
| `CLOSED` without `maintenance_released_at` | 1 | **AUTOTEST** — the row is literally `[AUTOTEST-L27] fabricate closed case dir…`, the exploit-proof case created in Loop 27 to demonstrate RISK-19 | **No** — migration 0026 (`cases_insert_column_lockdown`) closed that path; the case predates it by ~4 minutes |
| `MAINTENANCE_RELEASED`/`CLOSED` without `technically_restored_at` | 2 | **LEGACY** + the same L27 row. The second is `[AUTOTEST] QC gate regression fix check`, whose entire event history is a *single* `STATUS_TRANSITION` jumping straight to `MAINTENANCE_RELEASED` — the RISK-11/0012 regression | **No** — `DB VERIFIED`: the live `status_transitions` graph contains only `TECHNICALLY_RESTORED→CLEARANCE_PENDING`, `CLEARANCE_PENDING→MAINTENANCE_RELEASED`, `TECHNICALLY_RESTORED→MAINTENANCE_RELEASED`. There is no edge from `REPORTED` |
| Spare usage with no linked request | 151 | **LEGACY** — latest such row `2026-09-07 02:41:07`; migration 0028 (`spare_usage_requires_request`) landed `02:43:03` | **No** |
| Orphan case events / orphan spare usage | 0 / 0 | clean | — |
| Duplicate active waits / safety stops / pending clearances | 0 / 0 / 0 | clean | — |
| `CLEARED` clearance whose case is not released | 0 | clean | — |

**Nothing is silently rewritten.** All four anomalous rows are test artifacts in
a database with no real data; no data-remediation plan is warranted, and the
regressions that produced them are already closed by 0026/0012/0028 with tests.

### New finding not on the brief's list — audit gap on case creation

`DB VERIFIED`: **2,686 of 7,592 cases have zero `case_events` AND zero
`audit_log` rows.** Unlike the rows above this **is** reproducible by current
code — the newest example was created `2026-09-07 11:55:32`, minutes before this
audit.

Cause (`CODE VERIFIED`): a case is created by a **direct client insert**
(`src/app/(app)/cases/new/page.tsx` → `.from("cases").insert(...)`), not by an
RPC. Only `transition_case` and the other RPCs write events and audit rows, so
a reported case that has not yet been acted on leaves no event and no audit
entry at all. The case row itself carries `reporter_user_id` and `created_at`,
so the *fact* of creation is recorded — but §43 item 3 requires that "every
material action is auditable," and case creation is the origin of the entire
record.

This is raised as a finding, not fixed unilaterally, because whether case
creation counts as an auditable "material action" is a contract reading the
Boss should confirm.

---

## F-07 — stale lifecycle vocabulary — **CONFIRMED, narrower and worse than described**

`CODE VERIFIED` + `DB VERIFIED`.

The live enum `maintenance.case_status` has 16 values and contains **neither
`WAITING` nor `QC_PENDING`** — the data model is already correct and matches the
locked lifecycle. The stale vocabulary survives in exactly **one** file:

`src/app/(app)/dashboard/page.tsx:85-96` — the `statusColor` map keys
`WAITING` and `QC_PENDING`, which no case can ever have.

`src/app/(app)/cases/page.tsx` has its own map and is **already correct**
(`ACKNOWLEDGED`, `TECHNICALLY_RESTORED`, `CLEARANCE_PENDING`,
`MAINTENANCE_RELEASED`). So this is one file, not a systemic problem.

**The real defect is the mirror image of the reported one.** Because those two
dead keys occupy the map, the eight *real* statuses it omits —
`ACKNOWLEDGED`, `NEEDS_INFORMATION`, `TEMPORARILY_RESTORED`,
`TECHNICALLY_RESTORED`, `CLEARANCE_PENDING`, `QC_REJECTED`,
`MAINTENANCE_RELEASED`, `REOPENED` — all fall through to the same
`bg-slate-300` grey used for `REJECTED`/`DUPLICATE`. The "Cases by status"
chart renders half the lifecycle as one indistinguishable colour. Removing the
dead keys is cosmetic; adding the missing ones is the actual fix.

---

## F-08 — security hardening — **CONFIRMED**

Supabase security advisor, live:

| Lint | Level | Detail |
|---|---|---|
| `function_search_path_mutable` | WARN | `maintenance.is_manager` has a role-mutable `search_path` |
| `auth_leaked_password_protection` | WARN | HaveIBeenPwned checking is disabled |
| `rls_enabled_no_policy` | INFO | `maintenance.idempotency_keys` has RLS on and no policies |

`CODE VERIFIED`: `is_staff()` and `is_manager()` are plain `stable sql`
functions with **no** `set search_path` (0002:53, 0010:24). They are SECURITY
INVOKER, and their one call — `maintenance.current_staff_role()` — is
schema-qualified, and `current_staff_role()` itself *is* SECURITY DEFINER with a
pinned `search_path`. So the practical exploitability is low (an attacker would
need `CREATE` on the `maintenance` schema to shadow the callee). The fix is
cheap, behaviour-preserving, and closes the lint — worth doing, but it should
not be reported as an open bypass, because it is not one.

The `idempotency_keys` INFO is **correct by design, not a defect**: RLS on with
no policy means no client access at all, and only SECURITY DEFINER RPCs touch
the table. Documented rather than "fixed."

---

## F-09 — indexing — **CONFIRMED, but only three indexes are justified**

`DB VERIFIED`. Of the 21 tables carrying `case_id`, most already have an index.
Cross-referencing the missing ones against what
`src/app/(app)/cases/[id]/page.tsx` actually queries by `case_id`:

| Table | Rows | Has `case_id` index? | Queried by `case_id` on case detail? | Justified? |
|---|---:|---|---|---|
| `evidence` | 171 | **no** | yes | **yes** |
| `capa_links` | 53 | **no** | yes | **yes** |
| `case_assets` | 52 | **no** | yes | **yes** |
| `notifications` | 3,089 | no | **no** (queried by `recipient_user_id`/`read_at`) | no |
| `idempotency_keys` | 49 | no | no (keyed by `key`) | no |
| `pm_instances` | small | no | no | no |

Adding indexes to `notifications`/`idempotency_keys`/`pm_instances` on `case_id`
would be exactly the "blindly index every FK" the brief warns against — those
columns are not the ones being filtered on.

---

## F-10 — dashboard over-fetching — **ALREADY MEASURED AND PARTLY ADDRESSED**

The brief says "measure first." That measurement was already done and merged
earlier today (see CHANGELOG "Performance — app load/navigation latency"):

- `explain analyze` on the case-list query: **6.783 ms** execution, proper
  `Index Scan Backward`. The database is not the bottleneck.
- The real costs were cross-region round trips (functions in `iad1`, database in
  `ap-southeast-1`) and strictly sequential per-page queries. Both fixed;
  CI e2e went from a 125–156 s band to a 66–80 s band across three runs each way.

**What remains true from F-10:** the dashboard still fetches every case row and
aggregates in application code (`dashboard/page.tsx` selects all cases, then
filters/counts in TypeScript). At 7,592 rows that is fine; it will not be at
100,000. This is a **documented scale risk**, not a present defect, and per the
brief it must not be folded into a security remediation.

---

## Summary of what Phase 3 will change

| Finding | Action | Risk of the fix |
|---|---|---|
| F-01 | QC authority seam; `qc_decision` fails closed | **Highest — changes what the app can do.** Needs Boss acceptance of the fail-closed consequence |
| F-02/03/04 | One `can_read_case()` predicate on 4 SELECT policies | Medium — must not strand reporters/technicians; tests cover all four identities |
| F-05 | Environment separation; no data deletion | Low |
| F-06 | No history rewrite; regression tests only | None |
| F-07 | Dashboard status map corrected | None |
| F-08 | `search_path` pinned; leaked-password protection | Low |
| F-09 | 3 justified indexes | None |
| F-10 | Documented scale risk only | None |
