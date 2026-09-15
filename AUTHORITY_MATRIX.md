# AUTHORITY MATRIX — MONARCH Maintenance

Derived from `IMPLEMENTATION_PACK.md` (LOCKED v0.2) and verified against the
implemented server-side guards. This is a record of what the
contract authorizes and what the code currently enforces — **not** a design
proposal. Where the pack does not name an actor, the cell says so rather than
inventing one.

**Re-verified at HEAD `f694a93` (Loop 119)** against live migration SQL —
this file had drifted from the code on 3 points since it was first written
(HEAD `bcf4b93`): Reopen case (migration 0050 later made it Manager-only —
was `is_staff()` when this file was written), QC Clear/Reject (migration
0031 later moved it to `is_qc_authority()` — was `is_staff()`, marked
"NO — F-01" here when this file was written; F-01 is resolved), and the
whole "Read authority" section's "today" column (migration 0032 already
narrowed every `using (true)` policy this file called a defect, before
this file's own `bcf4b93` snapshot — so "today" below has read as "target"
for a long time without this file saying so). Corrected in place below,
each with its actual migration citation, rather than left to mislead
whoever reads this file next expecting it to reflect the running system.

## Identities that actually exist

`DB VERIFIED` — `maintenance.staff_role` is an enum of exactly two values.

| Identity | How it exists in the system |
|---|---|
| **Maintenance Executive** | `maintenance.staff` row, role `MAINTENANCE_EXECUTIVE` |
| **Maintenance Manager** | `maintenance.staff` row, role `MAINTENANCE_MANAGER` |
| **Reporter** | any `auth.users` identity; recorded as `cases.reporter_user_id`. Not a role — a relationship to one case |
| **Technician** | any `auth.users` identity referenced by `case_assignments.technician_user_id`. §3.1: **no technician software role in V1**; they hold an authenticated execution identity, not a role row |
| **QC-authority holder** | **Mechanism exists** (migration 0031): `maintenance.qc_authority` table, granted per-user, checked by `is_qc_authority()`; deliberately NOT a `maintenance.staff` row (F-01/§43.8 — QC clearance truth sits outside Maintenance's own ownership). **Who in the real plant should hold this grant is still evidence-controlled** (§12: "Exact plant QC permit/authority remains evidence-controlled") — the seam is built and working, the real-world grant policy is not this repo's to invent |

`is_staff()` = has an active staff row (either role). `is_manager()` = role is
`MAINTENANCE_MANAGER`.

## Action authority

Legend: **YES** authorized · **NO** must be refused server-side ·
**EC** = `EVIDENCE-CONTROLLED / DO NOT INVENT` (pack does not name an actor).

| Action | Reporter | Technician identity | Executive | Manager | QC | Enforced where | Correct today? |
|---|---|---|---|---|---|---|---|
| Report a case | YES | YES | YES | YES | — | `cases_insert` RLS (34 columns pinned) | yes |
| Claim Emergency | YES | EC | YES | YES | EC | `claim_emergency` — reporter-or-staff | yes (§6) |
| Confirm Emergency | NO | NO | YES | YES | NO | `confirm_emergency` — `is_staff()` | yes (§6 two-step) |
| Acknowledge / take ownership | NO | NO | YES | YES | NO | `acknowledge_case` — `is_staff()` | yes |
| Set / override priority | NO | NO | YES | YES | NO | 0019 priority override | yes |
| Assign technician | NO | NO | YES | YES | NO | `assign_technician` — `is_staff()` | yes |
| Record intervention | NO | YES *(own, if actively assigned)* | YES | YES | NO | `record_intervention` (0029 — verifies a real assignment row exists) | yes |
| Record observation | NO | YES *(assigned)* | YES | YES | NO | `observations` RLS + RPC | yes |
| Raise safety / technical stop | NO | NO | YES | YES | NO | `raise_safety_stop` — `is_staff()` | yes (§15) |
| Request a spare | YES | YES | YES | YES | NO | `spare_requests` — §16.3 any signed-in actor | yes |
| Approve spare **> ₹12,000** | NO | NO | **NO** | **YES** | NO | `approve_spare_request` — `is_manager()` | yes (§3.3 LOCKED) |
| Record spare usage | NO | YES *(assigned)* | YES | YES | NO | `record_spare_usage` (0028 — request linkage mandatory) | yes |
| Record temporary restoration | NO | NO | YES | YES | NO | `transition_case` — `is_staff()` | yes |
| Record technical restoration | NO | NO | YES | YES | NO | `transition_case` + verification | yes |
| Decide / change "QC required" | NO | NO | YES | YES | NO | 0007 + audit fields | yes (§12) |
| **Send to QC** | NO | EC | **YES** | **YES** | — | `send_to_qc` — `is_staff()` + must be `TECHNICALLY_RESTORED` | yes (§12) |
| **QC Clear** | NO | NO | **NO** | **NO** | **YES** | `qc_decision` — `is_qc_authority()` (migration 0031, superseding 0007's `is_staff()`) | yes (§12, F-01 resolved) |
| **QC Reject** | NO | NO | **NO** | **NO** | **YES** | `qc_decision` — `is_qc_authority()` (migration 0031) | yes (§12, F-01 resolved) |
| Maintenance Release *(QC not required)* | NO | NO | YES | YES | — | `transition_case`, gated on `qc_required = false` | yes |
| Maintenance Release *(QC required)* | NO | NO | NO | NO | YES *(via clearance)* | reachable through `qc_decision`, `is_qc_authority()` | yes — F-01 resolved (migration 0031); read-side reachability gap found and fixed separately (RISK-36, migration 0056) |
| Close case | NO | NO | YES | YES | NO | `transition_case(..,'CLOSED',reason)` — `is_staff()` + reason mandatory (current body: migration 0053) | yes |
| Reopen case | NO | NO | **NO** | **YES only** | NO | `reopen_case` — `is_manager()` (migration 0050, superseding 0003's `is_staff()` — Boss-directed correction, RISK-32) | yes |
| Mark duplicate | NO | NO | YES | YES | NO | `mark_duplicate_case` | yes |
| Close as false complaint | NO | NO | YES | YES | NO | 0011 | yes |
| Configure recurrence rule | NO | NO | **NO** | YES | NO | `create_recurrence_rule` — `is_manager()` | yes (§18) |
| Approve PM plan | NO | NO | EC | YES | NO | 0013 | yes |
| **Production line-start authorization** | — | — | **NO** | **NO** | — | not implemented, and must not be | §13 — Production-owned |

## Read authority (the F-02/03/04 question)

**Corrected (Loop 119):** every "today = YES (defect)" row below described
`using (true)` policies from migration 0002 — already narrowed by migration
0032 (F-02, "read scope least privilege"), which pre-dates this file's own
first `bcf4b93` snapshot. This file kept calling the fixed state a live
defect for an unknown number of loops; there is no evidence it was ever
re-checked against `pg_policies` before Loop 114/119. The table now shows
verified current state only — no separate "today vs. target" split, since
target has been reality since 0032.

| Data | Reporter (own case) | Assigned technician | Executive | Manager | QC-authority holder | Non-maintenance third party | Unauthenticated |
|---|---|---|---|---|---|---|---|
| `cases` | YES | YES | YES | YES | YES *(only a case with a `clearances` row — migration 0056)* | NO | NO (RLS requires `authenticated`) |
| `evidence` | YES | YES | YES | YES | via `can_read_case()` | NO | NO |
| `safety_stops` | YES | YES | YES | YES | via `can_read_case()` | NO | NO |
| `production_boundary_events` | YES | YES | YES | YES | via `can_read_case()` | NO | NO |
| `restorations` | YES *(added migration 0055 — RISK-35, was staff-only since 0002, blocked the §11 dispute UI)* | YES | YES | YES | via `can_read_case()` | NO | NO |
| `clearances` | NO | NO | YES | YES | YES *(migration 0056 — RISK-36, was staff-only since 0002, blocked QC-authority from even loading the case page)* | NO | NO |
| `case_events` | via case scope | via case scope | YES | YES | — | NO *(already `is_staff()`)* | NO |
| Everything else | — | own rows only | YES | YES | — | NO *(already scoped)* | NO |

Staff see **all** Maintenance cases, not only their own — that is deliberate and
pack-backed (§22 shift-handover dashboard needs plant-wide Maintenance
visibility, and the 0002 migration states the intent as "All staff can see all
open work"). `maintenance.can_read_case(p_case_id)` (migration 0032, extended
0056) is the one function `evidence`/`safety_stops`/`production_boundary_events`/
`restorations` all now share for this, rather than each re-deriving the same
scope independently.

## Cells deliberately left EVIDENCE-CONTROLLED

| Question | Why not answered here |
|---|---|
| Which *real-world* identity/role should be granted QC authority | §12: "Exact plant QC permit/authority remains evidence-controlled." The mechanism (`maintenance.qc_authority`, `is_qc_authority()`) is built and enforced (F-01 resolved, migration 0031) — this only leaves open who the Boss should actually grant it to in the live plant, which is a real-world policy decision this repo cannot supply |
| Whether a technician may claim Emergency or send to QC | §6/§12 name the reporter and the Executive; the technician case is unstated. Current code allows reporter-or-staff to claim (technician gets no special right) — left as-is |
| Field-level redaction within a screen both locked roles can open (e.g. should Executive see a cost/vendor field Manager sees) | Not named anywhere in the pack — inventing one would be a new business rule. This is the only remaining open sliver of PENDING-03/RISK-04; the action/authority-level matrix above **is** the rest of PENDING-03's answer, verified against this repo's own RPC/RLS code (RISK-04 marked RESOLVED, Loop 114) |
| LOTO/PTW permit authority mechanics | PENDING-01 (RISK-02). §14 seams exist; authority does not |
| Recurrence threshold / window values | PENDING-04. Detection is built but inert until supplied |
