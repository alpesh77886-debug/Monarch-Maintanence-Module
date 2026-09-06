# MONARCH — Maintenance Module
## Claude Code Implementation Pack v0.2 — LOCKED / APPROVED

**Document Type:** Implementation Specification / Engineering Contract
**Module:** Maintenance
**Design Version:** v0.2
**Design State:** LOCKED — USER APPROVED FOR IMPLEMENTATION SPECIFICATION
**Approval Date:** 2026-09-06
**Canonical Design Source:** Notion — "MONARCH — Maintenance Development Package / Module Contract — v0.2 (DRAFT)"
**Implementation Authority:** ChatGPT — Engineering, Review & Delivery Authority
**Coding Agent:** Claude Code
**Evidence Assistants:** Sarvam / other AI may assist, but may not redefine locked requirements.

---

## 0. READ THIS FIRST — NON-NEGOTIABLE

This file is the implementation contract derived from the **latest locked state** of the canonical Maintenance design.

Claude Code MUST:

1. Implement ONLY what is explicitly LOCKED or clearly required by this pack.
2. Treat older `candidate`, `proposed`, `PENDING`, alternative lifecycle/state-machine text, and historical sections inside the canonical Notion page as historical reference only when they conflict with the locked reconciled design.
3. Never convert a hypothesis or unverified plant practice into system truth.
4. Never invent SOPs, authority, SLAs, thresholds, approval chains, financial rules, safety permissions, or integration contracts.
5. Keep unresolved plant-specific items explicitly `PENDING` and build implementation seams/interfaces rather than assumptions.
6. Preserve append-only audit history. Do not silently overwrite business events.
7. Do not create a second independent source of truth for Production breakdowns or Stores inventory.
8. Keep Phase-1 Maintenance standalone; live cross-module API dependencies are out of scope.
9. Prefer deterministic, auditable backend behaviour over AI inference.
10. Produce evidence that the implementation matches this contract before declaring work complete.

If repository evidence conflicts with this contract, STOP and report the conflict. Do not silently choose a side.

---

# 1. LOCKED ARCHITECTURE

## 1.1 Maintenance module mission

Maintenance is the technical control tower, asset memory, and preventive/corrective execution system.

The system must answer:

> What happened? Who owned it? What was done? What evidence proves it? What operational impact occurred? Was the asset actually restored? What remains pending? What spares were used, where, by whom, and how much?

## 1.2 Primary business object

Use **Maintenance Case** as the primary workflow object.

A Maintenance Case may represent:

- BREAKDOWN
- PREVENTIVE
- CORRECTIVE
- INSPECTION
- CALIBRATION
- PLANNED_REPLACEMENT
- MODIFICATION/IMPROVEMENT
- TRIAL_SUPPORT

Do not create a duplicate Production breakdown system.

## 1.3 Ownership boundaries

### Maintenance owns
- maintenance case truth
- technical observation
- diagnosis
- intervention/action history
- technician assignment
- maintenance restoration evidence
- temporary restoration tracking
- preventive maintenance execution
- recurrence suspicion/confirmation workflow
- maintenance-side closure
- maintenance spare-usage record
- maintenance workload/ownership history

### Maintenance does NOT own
- Production run truth
- Production restart authorization
- QC product disposition / clearance truth
- Stores stock truth
- Planner/changeover truth
- SAP financial/statutory truth
- autonomous safety authorization

---

# 2. PHASE BOUNDARY

## 2.1 V1 / Phase-1 must remain standalone

The Maintenance module MUST function without live APIs from:

- Production
- QC
- Stores
- Planning/Changeover
- SAP
- RAG

Explicit references/foreign keys/stubs may exist, but Maintenance V1 must not fail merely because another module is unavailable.

## 2.2 Integration strategy with existing Production breakdown substrate

Existing Production substrate includes:

- `production.breakdowns`
- `production.breakdown_events`
- lifecycle RPCs
- `production.audit_log`
- `production.idempotency_keys`

Final design decision: **HYBRID / PHASED**.

Rules:

- Production remains authoritative for Production breakdown/run truth.
- Maintenance owns Maintenance technical truth.
- Cross-reference is allowed.
- Duplicate independent truth is forbidden.
- V1 may store reference identifiers only.
- A future integration contract must define synchronization, reconciliation, audit behaviour, and failure handling before live orchestration is enabled.

Do NOT make an existing Production breakdown row silently become a Maintenance row.

---

# 3. SOFTWARE ROLES AND AUTHORITY

## 3.1 V1 software roles

Exactly two Maintenance software roles:

1. `MAINTENANCE_EXECUTIVE`
2. `MAINTENANCE_MANAGER`

There is **NO separate Maintenance Technician software role in V1**.

Technicians must still have authenticated individual identities when they execute/appear in case assignments or intervention records.

## 3.2 Authority principles

- Executive handles routine operational ownership and execution.
- Manager is the escalation/final-override authority where explicitly specified.
- Ownership and closure authority are distinct.
- Any available valid Executive may close a case where closure is otherwise permitted.
- Reopen authority = Executive + Manager.
- Manager may override routine Executive decisions where the locked matrix says so.

## 3.3 Financial/spare authority

Basis: **Total Budget / Invoice Total Amount**.

- `<= ₹12,000` → Maintenance Executive path.
- `> ₹12,000` → Maintenance Manager authority.

Do not retain the older ambiguous ₹10,000 boundary.

High-value spare approval proof is mandatory before the request can proceed when this control applies.

Important: approval proof is a **request prerequisite**, not automatically a whole-case closure blocker.

---

# 4. CASE LIFECYCLE — LOCKED

The authoritative lifecycle is:

```text
REPORTED
  ↓
ACKNOWLEDGED
  ↓
ASSESSED
  ↓
ASSIGNED
  ↓
DIAGNOSING
  ↓
IN_REPAIR
  ↓
TEMPORARILY_RESTORED
       OR
TECHNICALLY_RESTORED
```

After technical restoration:

```text
TECHNICALLY_RESTORED
        ↓
  Clearance required?
     /        \
   YES         NO
    ↓           ↓
CLEARANCE    MAINTENANCE_RELEASED
PENDING
```

### 4.1 QC rejection

```text
CLEARANCE_PENDING
        ↓
    QC_REJECTED
        ↓
DIAGNOSING / IN_REPAIR
```

QC rejection MUST:

- record reason
- preserve prior clearance history
- prevent closure through the rejected path

### 4.2 Technical verification failure

Technical restoration verification failure MUST NOT produce a successful `TECHNICALLY_RESTORED` outcome.

Return to:

- `DIAGNOSING`, or
- `IN_REPAIR`

with a mandatory failure reason and preserved history.

### 4.3 Maintenance release boundary

`MAINTENANCE_RELEASED` means the Maintenance-side technical/release boundary is satisfied.

It does **NOT** mean:

- Production authorization
- line-start authorization
- QC clearance
- production readiness in general

### 4.4 Closure

Maintenance-side closure is allowed when Maintenance-side blockers are clear.

If production did not restart only because the shift ended:

- Maintenance may still close.
- Record `PRODUCTION_NOT_RESTARTED`.
- Production restart remains a Production-owned event/reference.

### 4.5 Reopen

If the same problem reappears after successful restart/confirmation:

```text
CLOSED → REOPENED → DIAGNOSING / IN_REPAIR
```

Record:

- actor
- timestamp
- reason
- linked prior case history

### 4.6 Duplicate

Duplicate case handling:

- duplicate case state = `DUPLICATE`
- link to primary case
- primary remains active
- actor/time/reason recorded

### 4.7 False/wrong complaint

Reporting person may close a false/wrong complaint.

Mandatory:

- predefined closure reason
- `OTHER` + explanation where applicable
- actor
- timestamp

---

# 5. CASE INTAKE / TRIAGE / OWNERSHIP

## 5.1 Intake minimum

A case must support:

- case ID
- reporter identity
- created/report timestamp
- symptom/complaint
- asset/machine if known
- line/area if known
- shift where relevant
- evidence attachment/reference
- major/complex indication
- priority
- operational impact fields where available

Exact asset may be unknown at creation.

Never silently map an unknown asset.

A case may later be linked to one or more assets/machines.

## 5.2 Acknowledgement

Initial available Maintenance Executive acknowledges/takes ownership.

The system MUST record:

- acknowledgement actor
- acknowledgement timestamp
- owner
- priority
- initial assessment

Reporter notification text should clearly state who acknowledged the case.

## 5.3 Reject / request information

Executive can:

- reject complaint
- request more information

Request-more-information state:

`NEEDS_INFORMATION`

When information is supplied:

- retain interaction history
- retain timestamps
- return case to Executive queue

## 5.4 Priority

- Executive can change priority.
- Manager has final override.

Do not auto-authorize escalation solely from AI recommendations.

## 5.5 Assignment

Multiple technicians may be assigned to a single case.

For each assignment record:

- technician identity
- assigning actor
- assigned timestamp
- active/inactive relation as applicable
- execution/intervention references

Emergency intervention may occur before formal assignment.

In that situation:

- technician can start directly
- Executive records actual assignment/intervention afterwards
- actor/timestamp must remain auditable

## 5.6 Ownership transfer

Cases may be transferred between Executives.

Rules:

- ownership history preserved
- case age does not reset
- first valid Accept/Take Ownership wins when multiple Executives are available
- handover does not erase prior work

---

# 6. EMERGENCY / SAFETY-CRITICAL PATH

Emergency design is **TWO-STEP**.

1. Reporter may claim Emergency/Safety-Critical.
2. Maintenance Executive or Maintenance Manager confirms authorization.

The 1-hour emergency escalation clock starts **after authorized confirmation**, not from the unverified reporter claim.

Emergency intervention without prior formal assignment is permitted.

Record:

- emergency claim
- confirming authority
- confirmation timestamp
- intervention actor
- intervention timestamp
- reason/evidence

Do not allow a generic UI toggle to bypass this logic.

---

# 7. WAITING / DEPENDENCY ARCHITECTURE

WAITING is a dependency/hold overlay, not a competing second lifecycle.

Canonical representation:

```text
WAITING
+ Reason Type: INTERNAL | EXTERNAL
+ Free Text Reason
+ Owner
+ Entered At
+ Dependency Reference
+ Expected/Resolution Information (when available)
```

## 7.1 Required rules

- Reason type must be explicitly selected.
- Never infer INTERNAL/EXTERNAL from free text.
- Case age continues during WAITING.
- Wait duration is separately calculated.
- Returning from WAITING must preserve the full wait history.

## 7.2 Resume rules

External dependency explicitly resolved:

- automatic resume-ready behaviour
- immediate notification to assigned Executive
- dashboard visibility

Internal Maintenance dependency resolved:

- manual resume by Executive or Manager

Resume-ready with no required action for 24h:

- alert Executive + Manager
- show case
- waiting reason
- total case age
- wait duration
- assigned Executive

After Manager escalation:

- reminder every 24h until required action/state transition

## 7.3 Emergency escalation

Confirmed Emergency/Safety-Critical threshold = **1 hour**.

There is no separate escalation timing for HIGH/MEDIUM/LOW.

---

# 8. OBSERVATION + ACTION CONTINUITY JOURNAL

This is a mandatory V1 feature.

Every meaningful Executive interaction MUST create an append-only chronological continuity entry.

Canonical structure:

```text
OBSERVATION
→ ACTION
→ RESULT
→ CURRENT CONDITION
→ PENDING ACTION
→ BLOCKER
→ NEXT STEP
```

Each entry records:

- case ID
- executive/actor identity
- timestamp
- intervention/step reference
- observation
- action
- result
- current condition
- pending next action
- blocker/dependency
- evidence/reference where applicable

Corrections are additive, not destructive.

Handover must present the continuity trail clearly enough that the receiving Executive can understand exactly how far work has progressed without relying on verbal/WhatsApp history.

Do not compress away earlier observations/actions.

---

# 9. DIAGNOSIS / INTERVENTION DATA MODEL

Separate these concepts:

1. observed symptom
2. immediate action / containment
3. intervention
4. result
5. failure mode
6. validated root cause
7. permanent corrective action
8. effectiveness verification

Never collapse all of them into one free-text field.

## 9.1 Root cause rule

The system/AI MUST NOT infer or declare authoritative root cause from symptom text alone.

RAG may recommend candidates.

Only an authorized human process can validate and record root cause as authoritative.

---

# 10. TEMPORARY RESTORATION

`TEMPORARILY_RESTORED` is a real non-closure condition.

When entered:

- record restoration details
- preserve evidence
- generate/retain permanent-repair follow-up responsibility for Executive
- keep case non-closed unless a valid later path completes

Temporary restoration is never equivalent to permanent repair.

---

# 11. TECHNICAL RESTORATION / VERIFICATION

Executive records technical completion/restoration.

Verification may fail.

When verification fails:

- reason mandatory
- return to `DIAGNOSING` or `IN_REPAIR`
- preserve prior restoration event

Complainant disagreement path:

If Executive believes work is technically complete but complainant reports machine still not okay:

- complainant + Executive jointly decide
- no unilateral closure
- record decision, actors, timestamp, and evidence/history

---

# 12. QC / CLEARANCE GATE

Maintenance Executive can later change `QC Required` to YES even when complainant initially said NO.

Any change must record:

- actor
- timestamp
- reason

Sending to QC is manual.

Flow:

```text
Maintenance technical completion
        ↓
Maintenance Executive: Send to QC
        ↓
CLEARANCE_PENDING
        ↓
QC decision
```

QC denial:

- `QC_REJECTED`
- reason required
- return to `DIAGNOSING / IN_REPAIR`
- preserve all prior QC history

Do not automate QC clearance.

Exact plant QC permit/authority remains evidence-controlled.

---

# 13. PRODUCTION RESTART BOUNDARY

The locked contract is:

```text
Maintenance Technical Completion
→ QC/Clearance if required
→ MAINTENANCE_RELEASED
→ Production-owned line-start/restart process
```

Maintenance MUST NOT become Production's line-start authority.

### 13.1 Production started without Maintenance release

If a Maintenance safety/technical stop is active and Production starts anyway:

Record:

`PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE`

with:

- actor
- timestamp
- machine/line
- active stop reference
- reason/context

This is not a normal successful restart event.

Do not silently clear the stop.

### 13.2 Shift-end non-restart

If shift ends before production restarts:

- Maintenance may close if Maintenance-side conditions permit.
- Record `PRODUCTION_NOT_RESTARTED`.
- Do not fabricate restart confirmation.

---

# 14. MACHINE SAFETY / LOTO / PTW

LOTO and PTW are applicable capabilities.

## 14.1 Locked authority model

Maintenance Executive + Maintenance Manager, in defined situations.

Exact plant SOP for:

- issuer
- performer
- permit authority
- specific permit types
- authorized-person matrix

remains **PENDING** and MUST NOT be invented.

## 14.2 Expected control sequence

Where applicable:

```text
Machine Isolation / LOTO
→ Safe to Work confirmation
→ Maintenance intervention
```

PTW:

- `PTW Required = Yes/No`
- required permit/proof linked where applicable
- formally required proof must exist before governed work starts

The digital system must not declare a machine physically safe without plant-controlled confirmation.

No autonomous PLC/machine control in V1 unless separately approved and safety-engineered.

---

# 15. SAFETY / TECHNICAL STOP

Maintenance Manager or Executive may issue a safety/technical stop.

Immediate Production Manager notification is mandatory.

Record:

- actor
- timestamp
- reason
- affected machine/line

Production should not normally start against an active Maintenance stop.

The system must record exceptions rather than erase them.

---

# 16. SPARE REQUEST + USAGE TRACEABILITY

Spare usage traceability is mandatory V1.

## 16.1 Usage chain

```text
Spare
→ Case
→ Intervention
→ Asset/Machine
→ Actor
→ Date/Time
→ Quantity
→ Outcome
```

The system must be able to answer:

- which spare was used
- on which case
- on which machine/asset
- during which intervention
- who used/recorded it
- when
- quantity
- outcome

## 16.2 Responsibility boundary

**Maintenance records maintenance usage.**

**Stores remains authoritative for actual inventory stock truth.**

Maintenance MUST NOT become a second Stores stock ledger.

V1 may record:

- requested spare
- used spare
- quantity
- explicit Stores/reference identifiers
- request/usage timestamps
- evidence

Live Stores integration is Phase-3.

When Stores truth is unavailable, use an explicit status such as:

`STORES_REFERENCE_PENDING`

Never fabricate stock balances.

## 16.3 Spare request initiation

Technician can:

- raise spare requirement directly, OR
- inform Executive and have Executive raise it

Record initiator and time.

---

# 17. PM / PREVENTIVE MAINTENANCE

## 17.1 Recurring PM

Approved recurring schedules generate PM work automatically.

## 17.2 Special/one-time PM

Maintenance Manager may manually create special/one-time PM.

## 17.3 Approval/execution boundary

- Manager approves PM schedule/plan.
- Executive manages execution/assignment.

Exact frequencies/checklists must not be invented where plant evidence is missing.

## 17.4 PM overdue

System automatically flags:

`PM_OVERDUE`

and alerts:

- responsible Executive
- Maintenance Manager

Rescheduling must not erase original overdue history.

---

# 18. RECURRENCE DETECTION

Recurrence architecture is **HYBRID**:

- evidence tiers
- configurable threshold
- configurable window

System may automatically flag:

`Recurring Failure Suspected`

but must NOT automatically declare root cause.

Executive/Manager confirms recurrence status where authoritative confirmation is required.

Do not hard-code an unapproved recurrence threshold.

Historical examples may inform configuration but are not automatically the Maintenance rule.

---

# 19. CAPA

CAPA owner = Maintenance Manager.

CAPA effectiveness verification = Maintenance Manager.

The AI/system may suggest CAPA candidates, but must not autonomously certify effectiveness.

---

# 20. PLANNED MAINTENANCE WINDOW / PRODUCTION DEPENDENCY

Conflict between planned maintenance window and Production:

**Maintenance Manager + Production Manager jointly decide.**

Maintenance V1 may store:

- requested window
- dependency
- decision/reference

Live Planning/Changeover integration is Phase-3 only.

---

# 21. VENDOR / EXTERNAL DEPENDENCY

Vendor workflow is case-by-case, not a fixed mandatory approval chain.

Maintenance Manager provides technical input.

Purchase Team owns actual vendor coordination where applicable.

Do not encode a mandatory `Executive → Manager validation → Purchase` workflow unless separately approved.

---

# 22. SHIFT HANDOVER / AVAILABILITY

Dashboard must provide:

- total open cases
- Executive-wise pending
- Executive-wise completed
- unassigned
- overdue/aging
- priority/status
- current owner

## 22.1 Logout behaviour

Manual handover is preferred.

If an Executive logs out with unhanded cases:

- show warning popup
- if confirmed, auto-handover to next available/logged-in Executive
- preserve original owner, new owner, timestamp, reason/history

If no Executive/Manager is available:

- allow logout
- put case into `UNASSIGNED / WAITING_MAINTENANCE`

Case age does not reset.

## 22.2 Handover quality requirement

The receiver must have access to:

- latest state
- all observation/action continuity entries
- active blocker
- pending action
- owner history
- recent intervention results
- spare usage to date
- evidence references
- escalation state

---

# 23. NOTIFICATIONS / ESCALATION

Notifications are event-driven, not spam-driven.

Minimum locked notifications:

- acknowledgement to reporter
- resume-ready immediate notification
- 24h normal escalation
- 1h confirmed emergency escalation
- repeated 24h Manager reminder after escalation until action/state transition
- PM overdue alerts
- required ownership/handover notifications

Notification delivery must be idempotent and auditable.

---

# 24. AUTOMATION VS HUMAN DECISION

## AUTO — system may execute

- recurring PM generation from approved schedule
- PM overdue flagging
- case age calculation
- wait-duration calculation
- append-only audit/event persistence
- configured recurrence suspicion flag
- escalation notification at approved thresholds
- auto-handover on confirmed logout when recipient exists
- `UNASSIGNED / WAITING_MAINTENANCE` when nobody is available
- external dependency resolved → resume-ready
- immediate resume-ready notification
- 24h normal escalation
- 1h confirmed emergency escalation
- 24h Manager reminder after escalation

## HUMAN REQUIRED

- acknowledge/take ownership
- reject/request information
- set/change priority
- Manager override
- major/complex classification at complaint creation
- assign/reassign technicians
- emergency intervention recording
- diagnose/intervene
- technical completion/verification
- temporary restoration acceptance/follow-up
- resolve failed verification
- joint complainant disagreement resolution
- decide/record QC required
- manual Send to QC
- QC clearance/denial
- Production Manager line-start authorization
- Maintenance safety/technical stop
- record production started without release
- reopen
- duplicate linkage
- false/wrong complaint closure
- CAPA ownership/effectiveness
- PM schedule approval
- planned-window conflict decision
- spare request initiation
- high-value spare approval proof
- vendor coordination by Purchase
- LOTO/PTW execution/authorization per plant SOP

## RECOMMEND / FLAG ONLY

- similar historical failure
- recurrence suspicion
- possible root cause
- suggested spare
- suggested technician
- suggested priority/escalation
- suggested PM adjustment
- suggested permanent corrective action/CAPA
- suggested maintenance window

Recommendations may never become silent state transitions.

## NEVER AUTOMATE

- invent root cause
- declare machine safe
- equate temporary restoration with permanent closure
- equate technical restoration with production readiness
- give QC clearance
- authorize Production line start
- silently override safety stop
- change/delete history
- silently map unknown asset
- infer INTERNAL/EXTERNAL waiting from free text
- invent plant SOP/authority
- fabricate inventory truth
- fabricate financial impact

---

# 25. KPI + IMPACT MODEL

The data chain is:

```text
Case/Event Data
→ Operational Impact
→ Aggregation/Calculation
→ KPI
→ Dashboard / Management Decision
```

## 25.1 KPI groups

1. Reliability / Repeat Failure
2. Restoration & Execution
3. Production Impact — minutes + kg
4. Preventive Maintenance
5. Waiting / Dependency
6. Ownership / Workload
7. Quality / Closure
8. Financial Impact — ₹ only where authoritative basis exists

## 25.2 Minimum operational measures

Capture and calculate where valid:

- case age
- restoration time
- wait duration
- downtime minutes
- output loss kg
- recurrence indicators
- PM overdue
- ownership/workload
- closure quality / reopen signals
- escalation status

Missing data must NOT silently become zero.

Financial impact must use an authoritative source/basis.

Do not invent KPI targets or SLAs.

---

# 26. DATA MODEL — MINIMUM IMPLEMENTATION SHAPE

Use a normalized event/history model. Exact table names may be adapted to repository conventions, but the concepts below are mandatory.

Recommended core entities:

```text
maintenance_cases
maintenance_case_events
maintenance_case_ownership
maintenance_case_assets
maintenance_case_assignments
maintenance_interventions
maintenance_observations
maintenance_restorations
maintenance_clearances
maintenance_waits
maintenance_spare_requests
maintenance_spare_usage
maintenance_pm_plans
maintenance_pm_instances
maintenance_recurrence_flags
maintenance_capa_links
maintenance_evidence
maintenance_audit_log
maintenance_idempotency_keys
```

Do not create all tables blindly if an existing canonical repository schema already provides equivalent infrastructure. Reuse verified infrastructure where semantics match.

## 26.1 Case fields — minimum semantic set

- case_id
- case_type
- status/state
- reporter_user_id
- acknowledged_by_user_id
- current_owner_user_id
- priority
- major_complex_flag
- emergency_claimed
- emergency_confirmed
- emergency_confirmed_by
- emergency_confirmed_at
- symptom
- area
- line
- shift
- created_at
- acknowledged_at
- assigned_at
- technically_restored_at
- maintenance_released_at
- closed_at
- closure_reason
- production_not_restarted flag/reason
- production_started_without_maintenance_release flag/details
- external/internal references as explicit foreign/reference IDs

Do not add semantics not required by this contract without recording why.

---

# 27. EVENT SOURCING / AUDIT RULES

Every material state/action change should create an immutable event record.

Minimum event metadata:

- event_id
- case_id
- event_type
- actor_user_id
- occurred_at
- previous_state where relevant
- new_state where relevant
- reason where relevant
- evidence/reference
- request/idempotency key where applicable

Corrections:

- new corrective event
- no destructive overwrite of business history

Audit must support forensic reconstruction:

> who did what, when, from which state, to which state, and why.

---

# 28. IDEMPOTENCY / CONCURRENCY

Use existing project idempotency conventions when available.

The following operations require concurrency-safe behaviour:

- Take Ownership
- Accept Case
- State transition
- Assignment
- Reassignment
- Close
- Reopen
- Duplicate marking
- Handover
- Emergency confirmation
- Spare request creation
- Spare usage posting
- PM instance generation
- Escalation notification creation

### First-valid-actor rule

For simultaneous ownership acceptance:

- exactly one valid actor wins
- others receive deterministic conflict response
- no duplicate owner records

---

# 29. SECURITY / ACCESS CONTROL

Minimum requirements:

- authenticated users only
- role-based access for Executive vs Manager actions
- individual technician identities for assignments/execution
- no shared human login identity for audit-sensitive actions
- case-level history visible according to role/module rules
- Manager-only authority checks enforced server-side, not merely in UI
- audit records not user-editable

The UI is not a security boundary.

All authorization must be enforceable at backend/service/database boundary consistent with existing MONARCH security architecture.

---

# 30. MOBILE-FIRST UX

Primary execution context is mobile-first.

Common actions should be possible with minimal navigation:

- report case
- acknowledge/take ownership
- assign technician
- add observation/action entry
- update state
- record temporary restoration
- record technical restoration
- send to QC
- add waiting dependency
- resume
- record spare usage
- hand over
- close/reopen

The handover view must surface continuity, not only current status.

Do not design a desktop-first workflow and merely shrink it to mobile.

---

# 31. RAG BOUNDARY

RAG may surface:

- similar historical failures
- prior interventions
- recurrence patterns
- spare/dependency history
- temporary-repair ageing
- PM finding patterns
- evidence packs

RAG may recommend.

RAG may NOT:

- authorize state transitions
- create authoritative root cause
- declare safety
- invent SOP
- authorize Production restart
- give QC clearance
- invent SLA
- invent authority
- fabricate inventory or financial truth

Any RAG output used operationally must be labelled as advisory/evidence-derived, not authoritative.

---

# 32. V1 MUST-HAVE ACCEPTANCE SCOPE

V1 is not complete unless all of the following are implemented and tested:

1. Maintenance Case intake.
2. Acknowledgement + ownership + notification.
3. Triage + priority + Manager override.
4. Technician assignment/reassignment + multiple technicians.
5. Emergency intervention recording.
6. Core lifecycle with valid-transition enforcement.
7. Diagnosis/intervention records with separated semantics.
8. Temporary restoration as explicit non-closure state.
9. Technical restoration + verification and failure path.
10. QC-required gate + manual Send-to-QC + rejection history.
11. `MAINTENANCE_RELEASED` boundary.
12. Production non-restart recording and production-start-without-release recording.
13. Reopen / duplicate / false complaint.
14. WAITING + explicit INTERNAL/EXTERNAL + free-text reason + dependency.
15. Resume-ready + escalation + reminders.
16. Shift handover / availability handling.
17. PM recurring generation + one-time Manager-created PM + PM overdue.
18. Spare/dependency capture.
19. LOTO/PTW safety gate seams without invented authority.
20. Audit + idempotency.
21. Mobile-first execution UX.
22. KPI/impact capture.
23. Security/access foundation.
24. Executive Observation + Action Continuity Journal.
25. Spare Usage Traceability / Consumption History.

---

# 33. V1 MUST NOT DEPEND ON

- live Production API
- live QC API
- live Stores API
- live Planner/Changeover API
- live SAP API
- RAG availability
- AI-generated authoritative root cause

---

# 34. DO NOT BUILD YET

- full cross-module orchestration engine
- automatic Production-release authorization
- automatic safety authorization
- machine-safe declaration by software
- AI/root-cause engine that converts symptoms into authoritative cause
- automatic CAPA effectiveness judgment
- automatic ₹ loss calculation without approved basis
- autonomous vendor coordination/purchase approval
- automatic spare approval
- unvalidated PM frequency optimization
- predictive maintenance claims based only on historical text/RAG
- complex live PLC/machine control without separate safety engineering
- any feature whose authority/data owner/SOP is unresolved

---

# 35. PENDING / EVIDENCE-CONTROLLED GATES

These are implementation validation gates, not permission to invent architecture:

### PENDING-01 — LOTO/PTW plant SOP
Need verified:
- issuer
- performer
- permit authority
- authorized-person matrix
- exact permit types

### PENDING-02 — Production ↔ Maintenance hybrid integration contract
Need defined:
- reference identifiers
- synchronization direction
- reconciliation
- failure handling
- event/audit semantics
- future orchestration boundary

### PENDING-03 — Final granular permissions
Two software roles are locked, but exact permission matrix at action/field level must be verified against the repository/security architecture before production deployment.

### PENDING-04 — Recurrence threshold/window values
Architecture is locked as configurable hybrid evidence model.
Actual threshold/window values must be approved/validated, not invented.

### PENDING-05 — Any newly discovered plant-specific closure blocker
If implementation uncovers a genuine plant rule that changes closure authority/state semantics, stop and escalate before silently changing the contract.

---

# 36. ENGINEERING IMPLEMENTATION RULES

## 36.1 Before coding

Claude Code MUST inspect the repository and report:

- current Maintenance code, if any
- existing auth/RBAC patterns
- current Production breakdown tables/RPCs/events
- existing audit/idempotency patterns
- existing UI/page/navigation patterns
- existing shared components
- migrations and environment assumptions
- test framework and commands

Do not overwrite an existing equivalent implementation without evidence.

## 36.2 Implement backend truth before UI convenience

Order:

1. data model/migrations
2. state transition service/rules
3. authorization
4. audit/idempotency
5. event/history models
6. business operations
7. API/service layer
8. UI
9. notifications
10. dashboards/KPIs
11. E2E tests

## 36.3 State transition enforcement

All locked transition rules must be enforced server-side.

The UI may hide invalid buttons but MUST NOT be the only enforcement mechanism.

Attempted invalid transitions must produce deterministic errors and audit-safe behaviour.

---

# 37. TEST MATRIX — REQUIRED

At minimum, create automated tests for:

## Intake / ownership
- create case
- acknowledge
- concurrent accept race
- reject
- needs information
- return from needs information
- transfer ownership
- handover
- no available Executive/Manager

## Lifecycle
- each valid transition
- each invalid transition
- temporary restoration cannot close directly
- verification failure returns to repair/diagnosis
- QC rejection returns to repair/diagnosis
- closure only when valid
- reopen from closed
- duplicate linkage
- false complaint closure

## Emergency
- reporter claim without confirmation does not start 1h escalation
- authorized confirmation starts 1h clock
- emergency intervention without assignment is recorded correctly

## Waiting
- internal waiting
- external waiting
- explicit reason type requirement
- external resolution → resume-ready
- internal resolution → manual resume
- age continues while waiting
- 24h escalation
- repeated Manager reminder

## Production boundary
- maintenance release does not authorize Production start
- production not restarted due to shift end does not block Maintenance closure
- production started without maintenance release is recorded

## Safety
- LOTO/PTW required path
- missing proof blocks governed work path where configured
- exact SOP permissions are feature-flagged/configurable rather than invented

## Spares
- spare request direct by technician identity
- spare request via Executive
- usage linkage to case/intervention/asset/actor/time/quantity
- no Stores stock mutation from Maintenance usage record
- missing Stores reference handled explicitly

## PM
- recurring generation
- one-time Manager PM
- PM overdue
- overdue history preserved after reschedule

## Audit/idempotency
- append-only correction
- duplicate request suppression
- replay-safe notifications
- concurrent write safety

---

# 38. E2E ACCEPTANCE SCENARIOS

At minimum, run complete end-to-end scenarios:

### Scenario A — normal breakdown

```text
REPORTED
→ ACKNOWLEDGED
→ ASSESSED
→ ASSIGNED
→ DIAGNOSING
→ IN_REPAIR
→ TECHNICALLY_RESTORED
→ MAINTENANCE_RELEASED
→ CLOSED
```

Verify all evidence and timestamps.

### Scenario B — QC required / rejected

```text
...
→ TECHNICALLY_RESTORED
→ CLEARANCE_PENDING
→ QC_REJECTED
→ IN_REPAIR
→ TECHNICALLY_RESTORED
→ CLEARANCE_PENDING
→ clearance
→ MAINTENANCE_RELEASED
```

### Scenario C — temporary restoration

```text
IN_REPAIR
→ TEMPORARILY_RESTORED
→ follow-up
→ IN_REPAIR
→ TECHNICALLY_RESTORED
```

Verify temporary state never behaves as closure.

### Scenario D — waiting external dependency

```text
IN_REPAIR
→ WAITING(EXTERNAL)
→ external dependency resolved
→ RESUME_READY
→ notification
→ resume
→ continue lifecycle
```

### Scenario E — shift end before production restart

Verify:

- Maintenance can close when Maintenance-side conditions are met.
- `PRODUCTION_NOT_RESTARTED` is recorded.
- No fake restart event is created.

### Scenario F — reopen

```text
CLOSED
→ REOPENED
→ DIAGNOSING / IN_REPAIR
```

History must remain intact.

### Scenario G — handover

Executive A creates multiple observation/action entries.

Case transferred to Executive B.

B must see the complete chronological continuity trail and exact pending state.

### Scenario H — spare traceability

Record spare request and usage.

Verify the system can trace:

`spare → case → intervention → machine → actor → time → quantity → outcome`

without changing Stores stock truth.

---

# 39. FORENSIC VERIFICATION REQUIREMENTS

Claude Code MUST NOT conclude "implemented" merely because the UI opens.

Completion requires evidence of:

- schema/migration correctness
- backend transition enforcement
- role/permission enforcement
- audit trail
- idempotency
- concurrency correctness
- mobile execution flow
- notification rules
- KPI calculations
- E2E scenarios
- negative/invalid transition tests
- regression safety for existing Production module

Report exact commands used and exact test results.

---

# 40. REGRESSION SAFETY — EXISTING PRODUCTION SUBSTRATE

Because existing Production breakdown infrastructure is real and active:

- do not rename/drop/redefine Production breakdown semantics merely to fit Maintenance
- do not break existing lifecycle RPCs
- do not change Production authority without separate approval
- use controlled reference/integration seams
- demonstrate regression tests on existing Production functions

Maintenance implementation must be additive unless a specific migration is approved.

---

# 41. DELIVERABLES FROM CLAUDE CODE

Claude Code must return:

### A. Repository findings
- what already existed
- what was reused
- what was missing
- any contract conflict found

### B. Implementation summary
- migrations
- backend/service changes
- authorization changes
- UI changes
- notifications
- KPI/dashboard changes

### C. Evidence report
- test command list
- test counts/results
- failed tests and disposition
- E2E screenshots/logs where appropriate
- migration status

### D. Pending-gates report
Clearly list anything blocked by PENDING-01..05.

### E. No-assumption declaration
State explicitly any item that was intentionally left unimplemented because plant/business evidence was missing.

---

# 42. CHANGE CONTROL

Any proposed deviation from this pack must include:

```text
CHANGE ID
Problem
Current Locked Rule
Proposed Change
Evidence
Impact on lifecycle
Impact on authority
Impact on audit
Impact on KPI
Impact on integrations
Tests required
Approval required
```

Claude Code MUST NOT silently alter locked architecture.

A code comment saying "temporary assumption" is not approval to ship the assumption as business truth.

---

# 43. FINAL DEFINITION OF DONE

Maintenance V1 is considered implementation-complete only when:

1. Every locked core state/transition is enforced.
2. Every authority boundary is enforced server-side.
3. Every material action is auditable.
4. Case age and wait duration are independently preserved.
5. Temporary restoration cannot be mistaken for closure.
6. Technical restoration cannot be mistaken for Production authorization.
7. Production restart truth remains Production-owned.
8. QC truth remains QC-owned.
9. Stores stock truth remains Stores-owned.
10. Observation/action continuity is handover-grade.
11. Spare usage is traceable end-to-end without duplicating inventory truth.
12. Emergency escalation starts only after authorized confirmation.
13. Waiting escalation works at 24h; confirmed emergency at 1h.
14. PM overdue and recurring generation work deterministically.
15. Reopen/duplicate/false complaint paths are auditable.
16. Existing Production functionality does not regress.
17. No unresolved plant SOP has been invented.
18. All required E2E and negative tests pass or are explicitly reported as blocked.

---

# 44. HANDOFF TO CLAUDE CODE

**Instruction:** Start with repository forensics. Do not start by building UI screens from imagination.

First report the actual current implementation substrate, then implement the locked contract in small auditable increments.

Use the sequence:

```text
REPOSITORY FORENSICS
→ GAP MAP
→ MIGRATION / DATA CONTRACT
→ BACKEND STATE ENGINE
→ RBAC / AUTHORITY
→ AUDIT / IDEMPOTENCY
→ BUSINESS OPERATIONS
→ API/SERVICE
→ MOBILE UI
→ NOTIFICATIONS
→ KPI / DASHBOARD
→ TESTS
→ E2E
→ FORENSIC REVIEW
```

If a requirement is PENDING, do not invent the answer.

If a historical Notion section conflicts with this locked pack, the locked reconciled rules in this pack win.

If repository evidence conflicts with this pack, stop and report the conflict for engineering review.

**This is an implementation specification, not permission to reinterpret the Maintenance architecture.**

---

## Source / governance note

Derived from the latest locked state of the canonical Maintenance Development Package, including the user-approved reconciliation dated 2026-09-06, existing Production substrate findings, Maintenance source evidence, RAG boundary, automation/human-decision matrix, KPI/impact model, Observation + Action Continuity requirement, and Spare Usage Traceability requirement.

**Canonical design page:**
`MONARCH — Maintenance Development Package / Module Contract — v0.2 (DRAFT)`

**Canonical page state:** LOCKED / USER APPROVED / IMPLEMENTATION SPECIFICATION MAY PROCEED

**Engineering owner:** ChatGPT
**Implementation agent:** Claude Code


---

# 19. CLAUDE CODE — REPOSITORY / VERCEL / SENTRY / CONTROLLED AUTONOMOUS EXECUTION

## 19.1 Purpose of this section

This section is part of the same locked Implementation Pack.
It is NOT an optional guide.
It defines how Claude Code must create, connect, build, test, deploy, observe, repair, and govern the MONARCH Maintenance project.

Claude Code is authorized to execute engineering work autonomously within the boundaries of this document.
However, autonomy is explicitly bounded by the **5-LOOP BOSS APPROVAL GATE** defined below.

The implementation objective is:

`Repository → Application → Tests → Vercel Deployment → Sentry Observability → Verification → Repair → Repeat`

The loop may continue only in batches of five loops.

---

## 19.2 SOURCE OF TRUTH / PRIORITY ORDER

Claude Code MUST use this priority order:

1. This complete Implementation Pack, including this Section 19 and all later sections in this same file.
2. Explicit Boss approval messages given after a 5-loop gate.
3. Existing repository evidence and existing infrastructure configuration.
4. Existing code/tests/docs.
5. External documentation for tooling only (GitHub, Vercel, Sentry, framework/runtime documentation).

External documentation may explain HOW a tool works, but it MUST NOT redefine MONARCH business rules.

Claude Code MUST NOT treat generated code, README text, TODO comments, AI suggestions, or prior assumptions as higher authority than this pack.

If two requirements inside the repository conflict with this pack, this pack wins and the conflict must be documented.

If this pack itself contains a genuine unresolved contradiction that affects implementation, STOP and report it rather than inventing a resolution.

---

## 19.3 FIRST RUN — REPOSITORY CREATION / DISCOVERY

On first execution, Claude Code MUST inspect the environment before changing anything.

Required first-run actions:

1. Determine whether a GitHub repository for MONARCH Maintenance already exists.
2. If it exists, inspect it before creating anything.
3. If it does not exist, create the repository itself using the available authenticated GitHub capability.
4. Repository name should be:
   `monarch-maintenance`
   unless that exact name is unavailable, in which case select the closest deterministic name and document the deviation before continuing.
5. Repository visibility should follow the user's existing project/security context; do not expose confidential operational data publicly.
6. Initialize or preserve the required project structure.
7. Create the initial commit only after the repository has the minimum governance files.

Claude Code MUST NOT create duplicate repositories simply because a previous attempt partially failed.

Before repository creation, check for:
- existing repository
- existing remote
- current branch
- uncommitted work
- tags/releases
- existing deployment configuration
- existing Sentry configuration
- existing Vercel configuration

If any existing project appears to be the same MONARCH Maintenance project, treat it as the canonical working repository rather than creating a competing repository.

---

## 19.4 REQUIRED REPOSITORY GOVERNANCE FILES

The repository MUST contain, at minimum:

```text
index.html
README.md
CLAUDE.md
IMPLEMENTATION_PACK.md
STATUS.md
APPROVAL_GATE.md
CHANGELOG.md
RISK_REGISTER.md

/docs/architecture.md
/docs/lifecycle.md
/docs/permissions.md
/docs/evidence-model.md
/docs/kpi-impact.md
/docs/pending-gates.md

/src/
/tests/
/e2e/
/public/
/.github/workflows/
```

`IMPLEMENTATION_PACK.md` MUST contain this complete master document.

Claude Code MUST NOT create a shortened or lossy substitute and call it the implementation contract.

If the repository already contains equivalent files, Claude Code should reconcile them without destroying useful history.

---

## 19.5 CLAUDE.MD MUST ENFORCE THIS OPERATING MODEL

Claude Code MUST create/update `CLAUDE.md` so that any subsequent Claude Code session understands:

- This repository implements MONARCH Maintenance.
- `IMPLEMENTATION_PACK.md` is the master implementation contract.
- The architecture is locked.
- No business-rule invention is permitted.
- No silent architecture drift is permitted.
- No destructive history rewriting is permitted.
- Every change must be testable and auditable.
- Vercel and Sentry are part of the verification loop.
- The 5-loop Boss approval gate is mandatory.
- Claude Code must STOP after Loop 5, 10, 15, 20, etc., until explicit Boss approval is received.

The file MUST explicitly state that "green build" does not equal "correct product".

---

## 19.6 VERCEL CONNECTION / DEPLOYMENT

Claude Code MUST attempt to establish the project on Vercel using available authenticated tooling.

Required workflow:

1. Detect whether an existing Vercel project already maps to this repository.
2. If yes, inspect it and reuse it.
3. If no, create/link a Vercel project for the repository.
4. Configure the correct production deployment path.
5. Configure preview deployments where appropriate.
6. Configure environment variables only through secure Vercel/environment mechanisms.
7. NEVER commit secrets, tokens, private keys, API keys, DSNs requiring secrecy, or credentials into Git.
8. Trigger a deployment.
9. Verify deployment status.
10. Open/check the deployed application.
11. Exercise meaningful application flows through the deployed environment.
12. Record deployment URL, deployment status, commit/reference, and verification result in `STATUS.md`.

Claude Code MUST distinguish:

- repository build success
- Vercel build success
- deployment success
- runtime health
- functional correctness

A successful deployment alone is insufficient for a loop to be marked successful.

If Vercel authentication/permissions prevent setup, Claude Code MUST STOP and report the exact blocker.

---

## 19.7 SENTRY CONNECTION / OBSERVABILITY

Claude Code MUST attempt to establish Sentry for the Maintenance application using the available authenticated capability.

Required workflow:

1. Detect whether a Sentry project already exists for MONARCH Maintenance.
2. If it exists, reuse it.
3. If not, create/configure a suitable Sentry project if authenticated capability permits.
4. Integrate the official/current Sentry SDK appropriate for the chosen application framework.
5. Configure environment-aware error reporting.
6. Do not leak secrets or private operational data into error events.
7. Add meaningful application context where useful (for example route/module/environment), but never add unnecessary personal or confidential information.
8. Verify that a controlled test error/event can be captured in the intended non-production verification environment.
9. Verify that real application exceptions are observable.
10. Record Sentry integration status and verification evidence in `STATUS.md`.

IMPORTANT:

`Sentry has no visible errors` MUST NOT be interpreted as `the application has no bugs`.

A clean Sentry state is evidence only that no captured/observed Sentry events are currently present.
It does not prove requirements, UX, authorization, data integrity, safety, or business logic correctness.

If Sentry authentication/permissions prevent setup, Claude Code MUST STOP and report the exact blocker.

---

## 19.8 APPLICATION CREATION / INDEX.HTML

Claude Code may start from `index.html` or an appropriate modern application entry point, but MUST choose the simplest production-suitable architecture that satisfies the locked requirements.

Do not over-engineer the stack merely for novelty.

The first implementation milestone is a functioning Maintenance application skeleton, followed by incremental implementation of the locked V1 scope.

The application MUST remain:

- deterministic
- auditable
- mobile-first for execution workflows
- permission-aware
- append-only for business history
- suitable for later backend integration
- safe around unresolved plant-specific authority

A UI mockup without working state transitions, validation, audit behaviour, and test evidence MUST NOT be reported as a completed feature.

---

# 19.9 FIVE-LOOP AUTONOMOUS DEVELOPMENT MODEL

Claude Code MUST work in discrete development loops.

One loop means:

```text
INSPECT
  ↓
IMPLEMENT
  ↓
TEST
  ↓
RUN
  ↓
DEPLOY / VERIFY
  ↓
OBSERVE
  ↓
FIX
  ↓
DOCUMENT
```

A loop ends only after Claude Code has:

- implemented a bounded change
- run relevant automated tests
- run relevant application checks
- checked deployment impact where applicable
- checked runtime/observability evidence where applicable
- recorded material defects found
- updated status/change/risk records as required

Claude Code MUST NOT count a trivial commit, documentation-only change, or repeated failed command as a successful engineering loop.

Loops are counted from actual implementation iterations, beginning with Loop 1.

---

## 19.10 LOOP QUALITY RULES

Every loop MUST answer:

1. What requirement(s) were targeted?
2. What changed?
3. What tests were added or executed?
4. What passed?
5. What failed?
6. What remains incomplete?
7. What did Vercel report?
8. What did Sentry report or fail to report?
9. What risks were discovered?
10. What is the next highest-value engineering action?

Claude Code MUST NOT hide failures merely because the final build became green.

A loop with unresolved HIGH or CRITICAL defects may still be completed as a development loop, but those defects MUST be explicitly carried forward and counted in the gate report.

Safety-critical uncertainty MUST trigger a STOP even before the 5-loop limit.

---

# 19.11 HARD BOSS APPROVAL GATE — EVERY 5 LOOPS

THIS RULE IS NON-NEGOTIABLE.

After:

- Loop 5
- Loop 10
- Loop 15
- Loop 20
- and every subsequent multiple of 5

Claude Code MUST STOP AUTONOMOUS DEVELOPMENT.

It MUST NOT automatically begin the next loop.

It MUST generate and present a gate report before waiting for Boss approval.

The stop occurs even when:

- all tests are green
- Vercel deployment is green
- Sentry shows no current errors
- the project appears nearly complete
- the next fix looks trivial

No technical optimism overrides this gate.

---

## 19.12 REQUIRED 5-LOOP GATE REPORT

At every gate, Claude Code MUST create/update:

`APPROVAL_REPORT_LOOP_<START>_<END>.md`

Examples:

```text
APPROVAL_REPORT_LOOP_01_05.md
APPROVAL_REPORT_LOOP_06_10.md
APPROVAL_REPORT_LOOP_11_15.md
```

The report MUST contain:

### A. Executive Status
- current loop number
- gate number
- overall project status
- current implementation state

### B. Completion
- total approved V1 requirements
- completed requirements
- partially completed requirements
- incomplete requirements
- completion percentage

Completion percentage MUST be based on the approved V1 requirement matrix, NOT on:
- number of files
- number of commits
- lines of code
- UI screens alone

### C. Error Register
For every unresolved material defect:
- ID
- description
- affected requirement
- severity
- discovered in loop
- reproduction/evidence
- current status
- recommended fix

Severity MUST use:

`CRITICAL / HIGH / MEDIUM / LOW`

### D. Consequence / Risk
For each CRITICAL or HIGH defect, explicitly explain:

`What could happen if this error is not fixed?`

Include operational, data-integrity, authorization, safety, reliability, UX, and deployment consequences where relevant.

### E. Vercel Status
Must state:
- linked project
- current deployment
- build result
- deployment result
- runtime verification result
- known deployment blockers

### F. Sentry Status
Must state:
- connected/not connected
- SDK/configuration status
- verification event result
- unresolved errors
- whether any conclusion is limited by lack of traffic/coverage

### G. Testing Status
Include:
- unit tests
- integration tests
- state-machine tests
- authorization tests
- audit/idempotency tests
- end-to-end tests
- deployment smoke checks
- regression tests

### H. Architecture Integrity
State whether any locked requirement was changed, weakened, inferred, or contradicted.

Any such event MUST be explicitly flagged.

### I. Pending Evidence Gates
Show all items still PENDING, including plant-specific authority/SOP/integration evidence.

### J. Recommended Next Work
Give the next highest-value work items in priority order.

### K. Boss Decision
The final section MUST state:

`WAITING FOR BOSS APPROVAL`

and must not automatically continue.

---

## 19.13 VALID BOSS APPROVAL TO CONTINUE

The next batch may begin only after the Boss explicitly approves continuation.

Examples of acceptable approval language include:

```text
Approved. Continue next 5 loops.
```

or

```text
Approved — proceed with Loop 6 to 10.
```

The approval MUST be explicit enough to establish intent to continue development.

Silence is NOT approval.

A suggestion, question, reaction, or acknowledgement such as "looks good" MUST NOT be treated as authorization to continue another five-loop batch unless it clearly authorizes continuation.

When explicit approval is received, Claude Code may continue only for the next five-loop batch.

Then the hard gate repeats.

---

## 19.14 WHAT CLAUDE CODE MAY DO AUTONOMOUSLY WITHIN A BATCH

Within the approved five-loop window, Claude Code may autonomously:

- inspect repository state
- create/update application code
- create/update tests
- repair detected defects
- refactor implementation without changing locked business meaning
- configure CI/CD
- connect and verify Vercel
- connect and verify Sentry
- improve error handling
- improve accessibility and mobile execution UX
- improve deterministic validation
- update documentation
- update status/risk/change records
- run regression tests
- redeploy and re-check

Claude Code may make ordinary engineering decisions where the requirements are unambiguous.

---

## 19.15 WHAT CLAUDE CODE MUST NOT DO AUTONOMOUSLY

Claude Code MUST NOT autonomously:

- alter locked Maintenance business rules
- change financial authority boundaries
- invent Production/Maintenance ownership
- invent LOTO/PTW authority
- invent plant safety SOPs
- grant QC clearance
- grant Production line-start authorization
- turn Maintenance release into Production authorization
- create a second Stores inventory truth
- create a second Production breakdown truth
- invent SLA/threshold values not approved in this pack
- silently convert PENDING evidence into CONFIRMED truth
- infer root cause as authoritative
- authorize physical machine control without separately approved safety engineering
- delete/overwrite audit history
- lower a severity to make the gate appear healthier
- declare the project complete solely because the application deploys
- bypass a 5-loop Boss approval gate
- use a failed authentication state as permission to invent credentials or security bypasses

---

# 19.16 STOP CONDITIONS — IMMEDIATE HALT

Claude Code MUST stop immediately and report when any of the following occurs:

1. GitHub repository permissions are insufficient for required work.
2. Vercel permissions are insufficient for required work.
3. Sentry permissions are insufficient for required work.
4. A secret/credential is required but unavailable through a secure mechanism.
5. A locked business rule conflicts with actual repository behaviour and resolution would change business meaning.
6. A safety-critical authority is unknown and implementation would require guessing.
7. A Production/Maintenance ownership conflict cannot be reconciled from the approved contract.
8. An implementation choice would create a second source of truth for Production breakdowns or Stores inventory.
9. Required plant SOP evidence is missing for a safety authorization feature.
10. The requested change would violate the locked V1 scope in a material way.
11. Data corruption or destructive migration risk is discovered.
12. Audit history could be lost or silently rewritten.
13. A severe security vulnerability is discovered.
14. The application cannot be honestly represented as passing the required acceptance criteria.
15. The fifth loop in the current batch is complete.

When a STOP condition occurs, Claude Code MUST state:

- what triggered the stop
- what evidence proves it
- what was safely completed
- what remains blocked
- what decision or credential/evidence is required

---

# 19.17 STATUS.MD REQUIREMENT

`STATUS.md` MUST remain the live engineering status file.

At minimum it must contain:

```text
Project
Current approved design version
Current loop
Current gate
V1 completion %
Completed requirements
Incomplete requirements
Open defects
Highest severity
Vercel status
Sentry status
Test status
Pending evidence gates
Last verified commit/reference
Last gate report
Next authorized work
Approval state
```

When waiting at a Boss gate, the status MUST clearly say:

`AUTONOMOUS DEVELOPMENT PAUSED — WAITING FOR BOSS APPROVAL`

---

# 19.18 CHANGELOG.MD REQUIREMENT

Every material loop MUST add a dated entry to `CHANGELOG.md`.

Entry should include:

- loop number
- summary
- requirements affected
- material fixes
- tests
- deployment/reference
- known limitations

Do not rewrite historical entries to make them appear cleaner.

---

# 19.19 RISK_REGISTER.MD REQUIREMENT

`RISK_REGISTER.md` MUST contain live material engineering risks.

Each risk must have:

- ID
- description
- severity
- affected area
- evidence
- mitigation
- owner/next action if known
- state

Resolved risks remain historically visible.

---

# 19.20 DEFINITION OF PROJECT COMPLETION

The project is NOT complete merely because:

- index.html loads
- the UI looks correct
- tests exist
- Vercel deploys
- Sentry is connected
- there are no current Sentry errors

Project completion requires evidence that the approved V1 acceptance scope has been implemented and verified.

At minimum:

1. Approved V1 requirements implemented or explicitly documented as excluded by scope.
2. State transitions enforced.
3. Authorization boundaries enforced.
4. Auditability verified.
5. Idempotency verified where applicable.
6. Negative-path behaviour tested.
7. Mobile execution paths tested.
8. Safety/PENDING gates preserved.
9. Production/Maintenance ownership boundaries preserved.
10. Stores inventory ownership boundary preserved.
11. KPI/impact data model verified.
12. Vercel deployment verified.
13. Sentry integration verified.
14. Regression suite passing for implemented scope.
15. No unresolved CRITICAL defects.
16. Any unresolved HIGH defects explicitly accepted by the Boss rather than silently ignored.
17. Final forensic review completed.

---

# 19.21 REQUIRED FINAL FORENSIC REVIEW

Before declaring the project complete, Claude Code MUST perform a forensic review against this entire Implementation Pack.

The review MUST compare:

`LOCKED REQUIREMENT → CODE → DATA MODEL → AUTHORIZATION → TEST → DEPLOYED BEHAVIOUR → OBSERVABILITY`

For every major requirement, evidence must be traceable.

The final review must explicitly search for:

- duplicate sources of truth
- unauthorized state transitions
- missing audit events
- missing actor/timestamp fields
- silent history mutation
- incorrect ownership transfer
- incorrect closure conditions
- QC gate bypass
- Production release confusion
- WAITING/resume logic errors
- incorrect 1h/24h escalation handling
- spare traceability gaps
- PM overdue logic gaps
- recurrence false declarations
- permission bypasses
- missing negative-path tests
- UI/backend divergence
- unobserved runtime failures
- deployment drift

No final completion statement may be made without this review.

---

# 19.22 BOSS GATE OUTPUT FORMAT — HUMAN READABLE

At each fifth loop, the top of the report MUST begin with a compact dashboard such as:

```text
MONARCH MAINTENANCE — BOSS APPROVAL GATE

Loops completed: 01–05
Overall V1 completion: XX%

CRITICAL: X
HIGH: X
MEDIUM: X
LOW: X

Vercel: GREEN / YELLOW / RED
Sentry: GREEN / YELLOW / RED / BLOCKED
Tests: X passed / Y failed / Z skipped

Major incomplete areas:
- ...
- ...

What can happen if open critical/high issues remain:
- ...
- ...

Recommended next 5-loop work:
- ...
- ...

STATUS: WAITING FOR BOSS APPROVAL
```

The report then contains the full forensic detail.

---

# 19.23 EXECUTION DISCIPLINE

Claude Code should optimize for **correctness and evidence**, not speed or code volume.

Preferred order:

`Understand → Implement → Test → Verify → Repair → Document`

Not:

`Generate lots of code → deploy → declare done`

When a simpler implementation satisfies the contract more safely, prefer the simpler implementation.

When uncertain, preserve the locked architecture and surface the uncertainty.

When evidence is missing, mark it PENDING.

When a defect is found, fix it rather than hiding it.

When a defect cannot safely be fixed without a business decision, stop at the appropriate gate.

---

# 19.24 MANDATORY FIRST MESSAGE / FIRST RUN BEHAVIOUR

On first execution from this Implementation Pack, Claude Code MUST first produce a brief execution-state message stating:

- repository found/created
- current branch/commit
- Vercel found/linked/not yet available
- Sentry found/linked/not yet available
- current implementation baseline
- Loop 1 starting state
- any immediate blocker

Then begin the forensic repository inspection and Loop 1 work.

Claude Code MUST NOT ask the Boss to manually create GitHub/Vercel/Sentry resources when the authenticated tool capability available to Claude Code can create/link them itself.

If the required integration capability is genuinely unavailable, report that exact limitation instead of pretending the connection exists.

---

# 19.25 MASTER RULE

**CLAUDE CODE IS AUTONOMOUS WITHIN THE LOCKED CONTRACT, BUT NEVER AUTONOMOUS AGAINST THE CONTRACT.**

It may build, test, deploy, observe, repair, and iterate.

It may NOT redefine the system.

Every five completed engineering loops, it MUST STOP and wait for explicit Boss approval before continuing.

This rule applies for the entire lifetime of the MONARCH Maintenance repository unless the Boss explicitly changes the governance rule in a later approved specification.

---

# 20. IMPLEMENTATION HANDOFF — START NOW

Claude Code shall treat this file as the active execution command.

Immediate sequence:

`READ COMPLETE PACK`
→ `INSPECT ENVIRONMENT`
→ `FIND/CREATE GITHUB REPOSITORY`
→ `SET UP REPOSITORY GOVERNANCE`
→ `CONNECT/LINK VERCEL`
→ `CONNECT/LINK SENTRY`
→ `BUILD APPLICATION BASELINE`
→ `RUN LOOP 1`
→ `RUN LOOP 2`
→ `RUN LOOP 3`
→ `RUN LOOP 4`
→ `RUN LOOP 5`
→ `GENERATE BOSS GATE REPORT`
→ `STOP`
→ `WAIT FOR EXPLICIT BOSS APPROVAL`
→ `ONLY THEN CONTINUE NEXT 5-LOOP BATCH`

No step in this sequence permits bypassing the locked Maintenance architecture or the Boss approval gate.

END OF MASTER IMPLEMENTATION + CONTROL CONTRACT
