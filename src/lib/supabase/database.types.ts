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
  emergency_confirmed: boolean;
  symptom: string;
  area: string | null;
  line: string | null;
  shift: string | null;
  qc_required: boolean | null;
  created_at: string;
  acknowledged_at: string | null;
  closed_at: string | null;
  closure_reason: string | null;
}

export interface StaffMember {
  id: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
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
