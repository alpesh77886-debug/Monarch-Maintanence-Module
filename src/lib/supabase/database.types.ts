// Hand-written minimal types for the `maintenance` schema (Loop 1). These are
// not exhaustive — they cover only what the current UI touches. Regenerate /
// extend as more of IMPLEMENTATION_PACK.md §26 gets a UI surface.

export type StaffRole = "MAINTENANCE_EXECUTIVE" | "MAINTENANCE_MANAGER";

export type CaseType =
  | "BREAKDOWN"
  | "PREVENTIVE"
  | "CORRECTIVE"
  | "INSPECTION"
  | "CALIBRATION"
  | "PLANNED_REPLACEMENT"
  | "MODIFICATION_IMPROVEMENT"
  | "TRIAL_SUPPORT";

export type CaseStatus =
  | "REPORTED"
  | "ACKNOWLEDGED"
  | "NEEDS_INFORMATION"
  | "ASSESSED"
  | "ASSIGNED"
  | "DIAGNOSING"
  | "IN_REPAIR"
  | "TEMPORARILY_RESTORED"
  | "TECHNICALLY_RESTORED"
  | "CLEARANCE_PENDING"
  | "QC_REJECTED"
  | "MAINTENANCE_RELEASED"
  | "CLOSED"
  | "REOPENED"
  | "DUPLICATE"
  | "REJECTED";

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface MaintenanceCase {
  id: string;
  case_number: string;
  case_type: CaseType;
  status: CaseStatus;
  reporter_user_id: string;
  acknowledged_by_user_id: string | null;
  current_owner_user_id: string | null;
  priority: Priority | null;
  major_complex_flag: boolean;
  emergency_claimed: boolean;
  emergency_claimed_by: string | null;
  emergency_claimed_at: string | null;
  emergency_claim_reason: string | null;
  emergency_confirmed: boolean;
  emergency_confirmed_by: string | null;
  emergency_confirmed_at: string | null;
  duplicate_of_case_id: string | null;
  symptom: string;
  area: string | null;
  line: string | null;
  shift: string | null;
  qc_required: boolean | null;
  created_at: string;
  acknowledged_at: string | null;
  // Lifecycle milestones. These exist on `maintenance.cases` and are what the
  // §25.2 duration measures (restoration time, time to closure) are derived
  // from — they were simply missing from this interface until Loop 14.
  assigned_at: string | null;
  technically_restored_at: string | null;
  maintenance_released_at: string | null;
  closed_at: string | null;
  closure_reason: string | null;
  // §13 boundary flags, mirrored onto the case for reporting.
  production_started_without_release: boolean;
  production_not_restarted: boolean;
  // §5.4: who last set the current priority. NULL means it has never been
  // changed since acknowledge_case — not yet Manager-locked. Once a Manager
  // sets it, only a Manager can change it further.
  priority_set_by_role: StaffRole | null;
  // §14.2 PTW seam. NULL means undecided (does not gate anything); an
  // explicit true requires ptw_proof_ref before IN_REPAIR is reachable.
  ptw_required: boolean | null;
  ptw_proof_ref: string | null;
}

// §9 item 6 / §9.1. A validated root cause, recorded by a human with a
// stated basis — never inferred from symptom text alone. Append-only: a
// correction supersedes rather than overwrites (§8, §27), same pattern as
// CaseImpactRecord (Loop 14).
export interface CaseRootCause {
  id: string;
  case_id: string;
  root_cause: string;
  basis: string;
  recorded_by: string;
  recorded_at: string;
  supersedes_record_id: string | null;
}

export interface CaseCurrentRootCause {
  case_id: string;
  root_cause_record_id: string;
  root_cause: string;
  basis: string;
  recorded_by: string;
  recorded_at: string;
}

// §5.1 / §26. `file_ref` is a reference (URL, photo pointer, report number),
// not an uploaded document this app stores itself. Any authenticated user
// may attach evidence to a case they can see — not staff-only, matching how
// case reporting itself works (a direct insert, not an RPC).
export interface CaseEvidence {
  id: string;
  case_id: string;
  uploaded_by: string;
  file_ref: string;
  description: string | null;
  created_at: string;
}

// §5.1: "A case may later be linked to one or more assets/machines." Staff
// only, direct insert (no RPC) — same shape as evidence, just staff-gated
// instead of any-authenticated. `linked_by`/`linked_at` are also what the
// §18 recurrence engine's ASSET_REF match tier reads from.
export interface CaseAsset {
  id: string;
  case_id: string;
  asset_name: string;
  asset_ref: string | null;
  linked_by: string | null;
  linked_at: string;
}

export interface StaffMember {
  id: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
  // §22: explicit, self-declared shift availability — used to pick a
  // handover receiver. Added in Loop 12.
  is_available: boolean;
  availability_changed_at?: string | null;
}

export interface SafetyStop {
  id: string;
  case_id: string;
  stop_type: "SAFETY" | "TECHNICAL";
  machine_ref: string | null;
  line_ref: string | null;
  reason: string;
  raised_by: string;
  raised_at: string;
  lifted_by: string | null;
  lifted_at: string | null;
  lift_reason: string | null;
}

export type ProductionBoundaryEventType =
  | "PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE"
  | "PRODUCTION_NOT_RESTARTED";

export interface ProductionBoundaryEvent {
  id: string;
  case_id: string;
  event_type: ProductionBoundaryEventType;
  safety_stop_id: string | null;
  machine_ref: string | null;
  line_ref: string | null;
  reason: string;
  recorded_by: string;
  recorded_at: string;
  case_status_at_record: CaseStatus;
}

export interface CaseOwnership {
  id: string;
  case_id: string;
  owner_user_id: string;
  assigned_by_user_id: string | null;
  started_at: string;
  ended_at: string | null;
  transfer_reason: string | null;
}

export interface CaseObservation {
  id: string;
  case_id: string;
  actor_user_id: string;
  observation: string | null;
  action: string | null;
  result: string | null;
  current_condition: string | null;
  pending_action: string | null;
  blocker: string | null;
  next_step: string | null;
  created_at: string;
}

export interface CaseAssignment {
  id: string;
  case_id: string;
  technician_user_id: string;
  assigned_by_user_id: string | null;
  assigned_at: string;
  is_active: boolean;
  emergency_direct_start: boolean;
}

export interface Intervention {
  id: string;
  case_id: string;
  technician_user_id: string | null;
  started_at: string;
  action_taken: string;
  result: string | null;
  failure_mode: string | null;
}

export interface CaseWait {
  id: string;
  case_id: string;
  reason_type: "INTERNAL" | "EXTERNAL";
  reason_text: string;
  entered_at: string;
  dependency_ref: string | null;
  expected_resolution_info: string | null;
  resume_ready_at: string | null;
  resumed_at: string | null;
  resume_type: "AUTO_EXTERNAL" | "MANUAL_INTERNAL" | null;
  last_escalated_at: string | null;
}

export interface Restoration {
  id: string;
  case_id: string;
  restoration_type: "TEMPORARY" | "TECHNICAL";
  recorded_at: string;
  details: string | null;
  verification_result: "PASSED" | "FAILED" | null;
  verification_failure_reason: string | null;
}

export interface Clearance {
  id: string;
  case_id: string;
  sent_to_qc_at: string;
  decision: "PENDING" | "CLEARED" | "REJECTED";
  decision_reason: string | null;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  event_type: string;
  actor_user_id: string | null;
  occurred_at: string;
  previous_status: CaseStatus | null;
  new_status: CaseStatus | null;
  reason: string | null;
}

// Kept in step with the live `notifications_notification_type_check`
// constraint. This list had drifted: PM_OVERDUE (Loop 10),
// CASE_HANDOVER_RECEIVED / CASE_UNASSIGNED (Loop 12) and
// PRODUCTION_BOUNDARY_BREACH (Loop 13) were all being written by RPCs but
// were missing here, so the type was quietly narrower than reality.
export type NotificationType =
  | "CASE_ACKNOWLEDGED"
  | "WAIT_RESUME_READY"
  | "WAIT_ESCALATION_24H"
  | "WAIT_MANAGER_REMINDER_24H"
  | "EMERGENCY_ESCALATION_1H"
  | "PM_OVERDUE"
  | "CASE_HANDOVER_RECEIVED"
  | "CASE_UNASSIGNED"
  | "PRODUCTION_BOUNDARY_BREACH"
  | "RECURRENCE_SUSPECTED"
  | "CAPA_ASSIGNED";

export interface AppNotification {
  id: string;
  recipient_user_id: string;
  case_id: string | null;
  notification_type: NotificationType;
  message: string;
  created_at: string;
  read_at: string | null;
}

export interface SpareRequest {
  id: string;
  case_id: string;
  intervention_id: string | null;
  spare_name: string;
  quantity_requested: number;
  initiated_by: string;
  initiated_role: "TECHNICIAN" | "EXECUTIVE";
  requested_at: string;
  estimated_amount: number | null;
  requires_manager_approval: boolean;
  approval_proof_ref: string | null;
  approved_by: string | null;
  approved_at: string | null;
  stores_reference_status: string;
  stores_reference_id: string | null;
}

export interface PmPlan {
  id: string;
  title: string;
  asset_ref: string | null;
  plan_type: "RECURRING" | "ONE_TIME";
  frequency_days: number | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PmInstance {
  id: string;
  pm_plan_id: string;
  case_id: string | null;
  due_at: string;
  generated_at: string;
  status: "SCHEDULED" | "OVERDUE" | "COMPLETED" | "RESCHEDULED";
  overdue_since: string | null;
  completed_at: string | null;
  rescheduled_from_instance_id: string | null;
}

export interface SpareUsage {
  id: string;
  spare_request_id: string | null;
  case_id: string;
  intervention_id: string | null;
  asset_ref: string | null;
  actor_user_id: string;
  used_at: string;
  quantity: number;
  outcome: string | null;
  stores_reference_status: string;
  stores_reference_id: string | null;
}

// §25.1 group 3 (Production Impact). Both measures are nullable on purpose:
// §25.2 says missing data must NOT silently become zero, so `null` means
// "not recorded" everywhere it is rendered — never 0.
export interface CaseImpactRecord {
  id: string;
  case_id: string;
  downtime_minutes: number | null;
  output_loss_kg: number | null;
  basis: string;
  recorded_by: string;
  recorded_at: string;
  supersedes_record_id: string | null;
}

// The newest non-superseded impact record per case (view). Corrections are
// new rows per §27, so this is the "current" figure without any UPDATE ever
// having touched the original.
export interface CaseCurrentImpact {
  case_id: string;
  impact_record_id: string;
  downtime_minutes: number | null;
  output_loss_kg: number | null;
  basis: string;
  recorded_by: string;
  recorded_at: string;
}

// §18 recurrence. A rule IS the "evidence tier" — the Manager names it and
// supplies the threshold and window. No rule rows are seeded anywhere: with
// none configured the scan flags nothing, which is how PENDING-04 (the
// unapproved threshold) is honoured in code rather than in a comment.
export interface RecurrenceRule {
  id: string;
  tier_name: string;
  match_on: "ASSET_REF" | "LINE" | "AREA";
  threshold_count: number;
  window_days: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  approval_note: string;
}

// §18: the system may flag SUSPECTED, never CONFIRMED, and must never write
// root_cause_note on its own.
export type RecurrenceStatus = "SUSPECTED" | "CONFIRMED" | "DISMISSED";

export interface RecurrenceFlag {
  id: string;
  case_id: string;
  related_case_ids: string[];
  flagged_at: string;
  evidence_tier: string | null;
  status: RecurrenceStatus;
  rule_id: string | null;
  match_value: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  decision_reason: string | null;
  root_cause_note: string | null;
  root_cause_note_by: string | null;
  root_cause_note_at: string | null;
}

// §19: owner and effectiveness verifier are both the Maintenance Manager.
// SYSTEM_SUGGESTED marks a candidate the system proposed — it is never a
// certification, which §19 forbids the system from making.
export type CapaStatus = "OPEN" | "VERIFIED_EFFECTIVE" | "VERIFIED_NOT_EFFECTIVE";

export interface CapaLink {
  id: string;
  case_id: string;
  title: string;
  owner_user_id: string;
  corrective_action: string | null;
  status: CapaStatus;
  source: "HUMAN" | "SYSTEM_SUGGESTED";
  proposed_by: string | null;
  recurrence_flag_id: string | null;
  verification_note: string | null;
  effectiveness_verified_by: string | null;
  effectiveness_verified_at: string | null;
  created_at: string;
}
