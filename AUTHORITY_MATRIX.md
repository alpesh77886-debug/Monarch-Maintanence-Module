# AUTHORITY MATRIX — MONARCH Maintenance

Derived from `IMPLEMENTATION_PACK.md` (LOCKED v0.2) and verified against the
implemented server-side guards at HEAD `bcf4b93`. This is a record of what the
contract authorizes and what the code currently enforces — **not** a design
proposal. Where the pack does not name an actor, the cell says so rather than
inventing one.

## Identities that actually exist

`DB VERIFIED` — `maintenance.staff_role` is an enum of exactly two values.

| Identity | How it exists in the system |
|---|---|
| **Maintenance Executive** | `maintenance.staff` row, role `MAINTENANCE_EXECUTIVE` |
| **Maintenance Manager** | `maintenance.staff` row, role `MAINTENANCE_MANAGER` |
| **Reporter** | any `auth.users` identity; recorded as `cases.reporter_user_id`. Not a role — a relationship to one case |
| **Technician** | any `auth.users` identity referenced by `case_assignments.technician_user_id`. §3.1: **no technician software role in V1**; they hold an authenticated execution identity, not a role row |
| **QC** | **does not exist today.** §12: "Exact plant QC permit/authority remains evidence-controlled." See F-01 |

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
| **QC Clear** | NO | NO | **NO** | **NO** | **YES** | `qc_decision` — **currently `is_staff()`** | **NO — F-01** |
| **QC Reject** | NO | NO | **NO** | **NO** | **YES** | `qc_decision` — **currently `is_staff()`** | **NO — F-01** |
| Maintenance Release *(QC not required)* | NO | NO | YES | YES | — | `transition_case`, gated on `qc_required = false` | yes |
| Maintenance Release *(QC required)* | NO | NO | NO | NO | YES *(via clearance)* | reachable only through `qc_decision` | blocked by F-01 |
| Close case | NO | NO | YES | YES | NO | `transition_case(..,'CLOSED',reason)` — `is_staff()` + reason mandatory | yes |
| Reopen case | NO | NO | YES | YES | NO | `reopen_case` — `is_staff()` | yes |
| Mark duplicate | NO | NO | YES | YES | NO | `mark_duplicate_case` | yes |
| Close as false complaint | NO | NO | YES | YES | NO | 0011 | yes |
| Configure recurrence rule | NO | NO | **NO** | YES | NO | `create_recurrence_rule` — `is_manager()` | yes (§18) |
| Approve PM plan | NO | NO | EC | YES | NO | 0013 | yes |
| **Production line-start authorization** | — | — | **NO** | **NO** | — | not implemented, and must not be | §13 — Production-owned |

## Read authority (the F-02/03/04 question)

Current state `DB VERIFIED`; target derived in `FORENSIC_REMEDIATION_RECON.md` §F-02.

| Data | Reporter (own case) | Assigned technician | Executive | Manager | Non-maintenance third party | Unauthenticated |
|---|---|---|---|---|---|---|
| `cases` — **today** | YES | YES | YES | YES | **YES (defect)** | NO (RLS requires `authenticated`) |
| `cases` — **target** | YES | YES | YES | YES | **NO** | NO |
| `evidence` — today / target | YES / YES | YES / YES | YES | YES | **YES (defect)** / NO | NO |
| `safety_stops` — today / target | YES / YES | YES / YES | YES | YES | **YES (defect)** / NO | NO |
| `production_boundary_events` — today / target | YES / YES | YES / YES | YES | YES | **YES (defect)** / NO | NO |
| `case_events` | via case scope | via case scope | YES | YES | NO *(already `is_staff()`)* | NO |
| Everything else | — | own rows only | YES | YES | NO *(already scoped)* | NO |

Staff see **all** Maintenance cases, not only their own — that is deliberate and
pack-backed (§22 shift-handover dashboard needs plant-wide Maintenance
visibility, and the 0002 migration states the intent as "All staff can see all
open work"). The defect is not that staff see too much; it is that
**non-Maintenance users see the same thing.**

## Cells deliberately left EVIDENCE-CONTROLLED

| Question | Why not answered here |
|---|---|
| Which identity performs QC Clear/Reject | §12: "Exact plant QC permit/authority remains evidence-controlled." The seam in F-01 creates a place to record the answer; it does not answer it |
| Whether a technician may claim Emergency or send to QC | §6/§12 name the reporter and the Executive; the technician case is unstated. Current code allows reporter-or-staff to claim (technician gets no special right) — left as-is |
| Granular per-field permission matrix | PENDING-03, open since Loop 20 (RISK-04). Not resolvable without Boss evidence |
| LOTO/PTW permit authority mechanics | PENDING-01 (RISK-02). §14 seams exist; authority does not |
| Recurrence threshold / window values | PENDING-04. Detection is built but inert until supplied |
