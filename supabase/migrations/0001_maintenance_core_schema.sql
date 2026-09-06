-- MONARCH Maintenance — core schema (IMPLEMENTATION_PACK.md §26)
-- Locked lifecycle: §4. Locked roles: §3. Standalone module, own schema: §2.1, CLAUDE.md.

create schema if not exists maintenance;

-- ---------------------------------------------------------------------------
-- Roles & staff identity (§3.1 — exactly two software roles; technicians are
-- individually-identified auth.users, not a distinct role)
-- ---------------------------------------------------------------------------

create type maintenance.staff_role as enum ('MAINTENANCE_EXECUTIVE', 'MAINTENANCE_MANAGER');

create table maintenance.staff (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null,
  role maintenance.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table maintenance.staff is 'MAINTENANCE_EXECUTIVE / MAINTENANCE_MANAGER identities. Technicians are auth.users referenced directly in assignments/interventions, not rows here (§3.1).';

-- ---------------------------------------------------------------------------
-- Case type / status / priority (§4, §7.3 references LOW/MEDIUM/HIGH explicitly;
-- no CRITICAL priority level is named anywhere in the locked pack, so it is not
-- invented here — see docs/permissions.md and RISK_REGISTER.md if this needs
-- revisiting).
-- ---------------------------------------------------------------------------

create type maintenance.case_type as enum (
  'BREAKDOWN', 'PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'CALIBRATION',
  'PLANNED_REPLACEMENT', 'MODIFICATION_IMPROVEMENT', 'TRIAL_SUPPORT'
);

create type maintenance.case_status as enum (
  'REPORTED', 'ACKNOWLEDGED', 'NEEDS_INFORMATION', 'ASSESSED', 'ASSIGNED',
  'DIAGNOSING', 'IN_REPAIR', 'TEMPORARILY_RESTORED', 'TECHNICALLY_RESTORED',
  'CLEARANCE_PENDING', 'QC_REJECTED', 'MAINTENANCE_RELEASED', 'CLOSED',
  'REOPENED', 'DUPLICATE', 'REJECTED'
);

create type maintenance.priority as enum ('LOW', 'MEDIUM', 'HIGH');

-- ---------------------------------------------------------------------------
-- Case number generator (human-readable, not the primary key)
-- ---------------------------------------------------------------------------

create sequence maintenance.case_number_seq;

create or replace function maintenance.next_case_number()
returns text
language sql
as $$
  select 'MC-' || lpad(nextval('maintenance.case_number_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------------------
-- Cases (§26.1 minimum semantic set)
-- ---------------------------------------------------------------------------

create table maintenance.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default maintenance.next_case_number(),
  case_type maintenance.case_type not null,
  status maintenance.case_status not null default 'REPORTED',

  reporter_user_id uuid not null references auth.users(id),
  acknowledged_by_user_id uuid references maintenance.staff(id),
  current_owner_user_id uuid references maintenance.staff(id),

  priority maintenance.priority,
  major_complex_flag boolean not null default false,

  emergency_claimed boolean not null default false,
  emergency_confirmed boolean not null default false,
  emergency_confirmed_by uuid references maintenance.staff(id),
  emergency_confirmed_at timestamptz,

  symptom text not null,
  area text,
  line text,
  shift text,

  -- Exact asset may be unknown at creation (§5.1) — never silently map one.
  asset_known boolean not null default false,

  qc_required boolean,
  qc_required_changed_by uuid references maintenance.staff(id),
  qc_required_changed_at timestamptz,
  qc_required_change_reason text,

  -- PENDING-01 seam only — no LOTO/PTW authority is encoded (docs/pending-gates.md).
  ptw_required boolean,
  ptw_proof_ref text,

  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  assigned_at timestamptz,
  technically_restored_at timestamptz,
  maintenance_released_at timestamptz,
  closed_at timestamptz,
  closure_reason text,

  production_not_restarted boolean not null default false,
  production_not_restarted_reason text,
  production_started_without_release boolean not null default false,
  production_started_without_release_detail text,

  duplicate_of_case_id uuid references maintenance.cases(id),

  -- Cross-module references only — never a foreign key into another module's
  -- database (§2.2, §13, §16.2, docs/architecture.md).
  production_case_ref text,
  stores_reference_status text,

  updated_at timestamptz not null default now()
);

create index on maintenance.cases (status);
create index on maintenance.cases (current_owner_user_id);
create index on maintenance.cases (created_at);

-- ---------------------------------------------------------------------------
-- Append-only business event stream (§27) — no UPDATE/DELETE grants ever.
-- ---------------------------------------------------------------------------

create table maintenance.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  event_type text not null,
  actor_user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  previous_status maintenance.case_status,
  new_status maintenance.case_status,
  reason text,
  evidence_ref text,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb
);

create index on maintenance.case_events (case_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Ownership history (§5.6, §22.1)
-- ---------------------------------------------------------------------------

create table maintenance.case_ownership (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  owner_user_id uuid not null references maintenance.staff(id),
  assigned_by_user_id uuid references maintenance.staff(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transfer_reason text
);

create index on maintenance.case_ownership (case_id, started_at);

-- ---------------------------------------------------------------------------
-- Asset linkage — a case may later be linked to one or more assets (§5.1)
-- ---------------------------------------------------------------------------

create table maintenance.case_assets (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  asset_name text not null,
  asset_ref text,
  linked_by uuid references maintenance.staff(id),
  linked_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Technician assignments — multiple technicians per case (§5.5)
-- ---------------------------------------------------------------------------

create table maintenance.case_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  technician_user_id uuid not null references auth.users(id),
  assigned_by_user_id uuid references maintenance.staff(id),
  assigned_at timestamptz not null default now(),
  is_active boolean not null default true,
  emergency_direct_start boolean not null default false,
  deactivated_at timestamptz
);

create index on maintenance.case_assignments (case_id);

-- ---------------------------------------------------------------------------
-- Interventions — separated from observation/diagnosis semantics (§9)
-- ---------------------------------------------------------------------------

create table maintenance.interventions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  technician_user_id uuid references auth.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  action_taken text not null,
  result text,
  failure_mode text,
  recorded_by uuid references maintenance.staff(id),
  created_at timestamptz not null default now()
);

create index on maintenance.interventions (case_id);

-- ---------------------------------------------------------------------------
-- Observation + Action Continuity Journal (§8) — append-only.
-- ---------------------------------------------------------------------------

create table maintenance.observations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  actor_user_id uuid not null references maintenance.staff(id),
  intervention_id uuid references maintenance.interventions(id),
  observation text,
  action text,
  result text,
  current_condition text,
  pending_action text,
  blocker text,
  next_step text,
  evidence_ref text,
  created_at timestamptz not null default now()
);

create index on maintenance.observations (case_id, created_at);

-- ---------------------------------------------------------------------------
-- Restorations — temporary vs technical, with verification failure path (§10, §11)
-- ---------------------------------------------------------------------------

create table maintenance.restorations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  restoration_type text not null check (restoration_type in ('TEMPORARY', 'TECHNICAL')),
  recorded_by uuid not null references maintenance.staff(id),
  recorded_at timestamptz not null default now(),
  details text,
  evidence_ref text,
  verification_result text check (verification_result in ('PASSED', 'FAILED')),
  verification_failure_reason text,
  follow_up_required boolean not null default false
);

create index on maintenance.restorations (case_id);

-- ---------------------------------------------------------------------------
-- QC / clearance gate (§12) — manual send-to-QC, rejection history preserved.
-- ---------------------------------------------------------------------------

create table maintenance.clearances (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  sent_to_qc_by uuid not null references maintenance.staff(id),
  sent_to_qc_at timestamptz not null default now(),
  decision text not null default 'PENDING' check (decision in ('PENDING', 'CLEARED', 'REJECTED')),
  decision_reason text,
  decided_at timestamptz
);

create index on maintenance.clearances (case_id);

-- ---------------------------------------------------------------------------
-- Waiting overlay (§7) — never infer INTERNAL/EXTERNAL from free text.
-- ---------------------------------------------------------------------------

create table maintenance.waits (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  reason_type text not null check (reason_type in ('INTERNAL', 'EXTERNAL')),
  reason_text text not null,
  owner_user_id uuid references maintenance.staff(id),
  entered_at timestamptz not null default now(),
  dependency_ref text,
  expected_resolution_info text,
  resume_ready_at timestamptz,
  resumed_at timestamptz,
  resume_type text check (resume_type in ('AUTO_EXTERNAL', 'MANUAL_INTERNAL')),
  last_escalated_at timestamptz
);

create index on maintenance.waits (case_id);
create index on maintenance.waits (resume_ready_at) where resumed_at is null;

-- ---------------------------------------------------------------------------
-- Spare request + usage traceability (§16) — Maintenance records usage only;
-- Stores stays authoritative for stock (never mutated here).
-- ---------------------------------------------------------------------------

create table maintenance.spare_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  intervention_id uuid references maintenance.interventions(id),
  spare_name text not null,
  quantity_requested numeric not null check (quantity_requested > 0),
  initiated_by uuid not null references auth.users(id),
  initiated_role text not null check (initiated_role in ('TECHNICIAN', 'EXECUTIVE')),
  requested_at timestamptz not null default now(),
  estimated_amount numeric,
  -- §3.3: > ₹12,000 requires Manager authority + approval proof before proceeding.
  requires_manager_approval boolean not null default false,
  approval_proof_ref text,
  approved_by uuid references maintenance.staff(id),
  approved_at timestamptz,
  stores_reference_status text not null default 'STORES_REFERENCE_PENDING',
  stores_reference_id text
);

create index on maintenance.spare_requests (case_id);

create table maintenance.spare_usage (
  id uuid primary key default gen_random_uuid(),
  spare_request_id uuid references maintenance.spare_requests(id),
  case_id uuid not null references maintenance.cases(id),
  intervention_id uuid references maintenance.interventions(id),
  asset_ref text,
  actor_user_id uuid not null references auth.users(id),
  used_at timestamptz not null default now(),
  quantity numeric not null check (quantity > 0),
  outcome text,
  stores_reference_status text not null default 'STORES_REFERENCE_PENDING',
  stores_reference_id text
);

create index on maintenance.spare_usage (case_id);

-- ---------------------------------------------------------------------------
-- Preventive maintenance (§17)
-- ---------------------------------------------------------------------------

create table maintenance.pm_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  asset_ref text,
  plan_type text not null check (plan_type in ('RECURRING', 'ONE_TIME')),
  -- No frequency is invented; a recurring plan must be given one explicitly.
  frequency_days integer check (frequency_days is null or frequency_days > 0),
  approved_by uuid references maintenance.staff(id),
  created_by uuid references maintenance.staff(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table maintenance.pm_instances (
  id uuid primary key default gen_random_uuid(),
  pm_plan_id uuid not null references maintenance.pm_plans(id),
  case_id uuid references maintenance.cases(id),
  due_at timestamptz not null,
  generated_at timestamptz not null default now(),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'OVERDUE', 'COMPLETED', 'RESCHEDULED')),
  overdue_since timestamptz,
  rescheduled_from_instance_id uuid references maintenance.pm_instances(id)
);

create index on maintenance.pm_instances (pm_plan_id);
create index on maintenance.pm_instances (status);

-- ---------------------------------------------------------------------------
-- Recurrence suspicion (§18) — flag only, never authoritative root cause.
-- ---------------------------------------------------------------------------

create table maintenance.recurrence_flags (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  related_case_ids uuid[] not null default '{}',
  flagged_at timestamptz not null default now(),
  evidence_tier text,
  confirmed boolean not null default false,
  confirmed_by uuid references maintenance.staff(id),
  confirmed_at timestamptz,
  -- Human-validated note only; the system never declares this authoritative (§9.1, §18).
  root_cause_note text
);

-- ---------------------------------------------------------------------------
-- CAPA (§19) — Manager owns; system may suggest, never certifies effectiveness.
-- ---------------------------------------------------------------------------

create table maintenance.capa_links (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  title text not null,
  owner_user_id uuid not null references maintenance.staff(id),
  corrective_action text,
  effectiveness_verified boolean not null default false,
  effectiveness_verified_by uuid references maintenance.staff(id),
  effectiveness_verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Evidence attachments
-- ---------------------------------------------------------------------------

create table maintenance.evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references maintenance.cases(id),
  uploaded_by uuid references auth.users(id),
  file_ref text not null,
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Technical audit log (§27, §29) — append-only, not user-editable.
-- ---------------------------------------------------------------------------

create table maintenance.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  idempotency_key text,
  occurred_at timestamptz not null default now()
);

create index on maintenance.audit_log (target_table, target_id);

-- ---------------------------------------------------------------------------
-- Idempotency (§28)
-- ---------------------------------------------------------------------------

create table maintenance.idempotency_keys (
  key text primary key,
  operation text not null,
  case_id uuid,
  actor_user_id uuid,
  result jsonb,
  created_at timestamptz not null default now()
);
