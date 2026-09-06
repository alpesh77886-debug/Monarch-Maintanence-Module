-- MONARCH Maintenance — Row Level Security (§29: "the UI is not a security boundary")
--
-- Design for Loop 1:
--   * maintenance.cases.status/current_owner_user_id are NEVER updated by a direct
--     client UPDATE — only by the SECURITY DEFINER RPCs in 0003_maintenance_state_engine.sql,
--     which run as the function owner and therefore bypass these RLS policies while still
--     enforcing the role checks themselves. This is what makes §36.3 ("all locked
--     transition rules must be enforced server-side") true even for a Postgres-level client.
--   * maintenance.case_events / audit_log / idempotency_keys are written ONLY by those
--     same RPCs — no INSERT policy is granted to `authenticated` on them, so they are
--     append-only from the application's point of view by construction, not by convention.
--   * Business-operation tables that Loop 1 does not yet gate behind a dedicated RPC
--     (observations, interventions, restorations, clearances, waits, spare_*, evidence,
--     case_assets, case_assignments, pm_*, recurrence_flags, capa_links) get direct INSERT
--     policies restricted to authenticated staff acting as themselves; no UPDATE/DELETE
--     policy is granted on any of them, so corrections must be new rows (§0 rule 6, §27).

alter table maintenance.staff enable row level security;
alter table maintenance.cases enable row level security;
alter table maintenance.case_events enable row level security;
alter table maintenance.case_ownership enable row level security;
alter table maintenance.case_assets enable row level security;
alter table maintenance.case_assignments enable row level security;
alter table maintenance.interventions enable row level security;
alter table maintenance.observations enable row level security;
alter table maintenance.restorations enable row level security;
alter table maintenance.clearances enable row level security;
alter table maintenance.waits enable row level security;
alter table maintenance.spare_requests enable row level security;
alter table maintenance.spare_usage enable row level security;
alter table maintenance.pm_plans enable row level security;
alter table maintenance.pm_instances enable row level security;
alter table maintenance.recurrence_flags enable row level security;
alter table maintenance.capa_links enable row level security;
alter table maintenance.evidence enable row level security;
alter table maintenance.audit_log enable row level security;
alter table maintenance.idempotency_keys enable row level security;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function maintenance.current_staff_role()
returns maintenance.staff_role
language sql
stable
security definer
set search_path = maintenance, public
as $$
  select role from maintenance.staff where id = auth.uid() and is_active;
$$;

create or replace function maintenance.is_staff()
returns boolean
language sql
stable
as $$
  select maintenance.current_staff_role() is not null;
$$;

create or replace function maintenance.is_manager()
returns boolean
language sql
stable
as $$
  select maintenance.current_staff_role() = 'MAINTENANCE_MANAGER';
$$;

-- ---------------------------------------------------------------------------
-- staff — readable by any authenticated staff member (needed for assignment /
-- ownership pickers); writes restricted to service role (onboarding is an
-- administrative action, not a self-service one — PENDING-03 governs anything finer).
-- ---------------------------------------------------------------------------

create policy staff_select on maintenance.staff
  for select to authenticated
  using (maintenance.is_staff());

-- ---------------------------------------------------------------------------
-- cases — any authenticated user may report a case (reporter need not be
-- Maintenance staff — e.g. a production operator). All staff can see all open
-- work (§22 dashboard requirement). No UPDATE policy: status/ownership changes
-- go exclusively through the SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------

create policy cases_select on maintenance.cases
  for select to authenticated
  using (true);

create policy cases_insert on maintenance.cases
  for insert to authenticated
  with check (reporter_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- case_events / audit_log / idempotency_keys — read-only to staff from the
-- client; all writes happen inside SECURITY DEFINER RPCs (no INSERT policy
-- granted here on purpose).
-- ---------------------------------------------------------------------------

create policy case_events_select on maintenance.case_events
  for select to authenticated
  using (maintenance.is_staff());

create policy audit_log_select on maintenance.audit_log
  for select to authenticated
  using (maintenance.is_staff());

-- idempotency_keys is internal bookkeeping; no client-facing select policy needed yet.

-- ---------------------------------------------------------------------------
-- case_ownership — history is staff-readable; written only by the take-ownership
-- / handover RPCs (no direct INSERT policy).
-- ---------------------------------------------------------------------------

create policy case_ownership_select on maintenance.case_ownership
  for select to authenticated
  using (maintenance.is_staff());

-- ---------------------------------------------------------------------------
-- case_assets — staff can read and link assets to a case.
-- ---------------------------------------------------------------------------

create policy case_assets_select on maintenance.case_assets
  for select to authenticated
  using (maintenance.is_staff());

create policy case_assets_insert on maintenance.case_assets
  for insert to authenticated
  with check (maintenance.is_staff() and linked_by = auth.uid());

-- ---------------------------------------------------------------------------
-- case_assignments — staff assign technicians; technicians can see their own
-- assignments, staff see all.
-- ---------------------------------------------------------------------------

create policy case_assignments_select on maintenance.case_assignments
  for select to authenticated
  using (maintenance.is_staff() or technician_user_id = auth.uid());

create policy case_assignments_insert on maintenance.case_assignments
  for insert to authenticated
  with check (
    (maintenance.is_staff() and assigned_by_user_id = auth.uid())
    or (emergency_direct_start and technician_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- interventions / observations — staff and the assigned technician can log;
-- append-only (no update/delete policy — §8 "corrections are additive").
-- ---------------------------------------------------------------------------

create policy interventions_select on maintenance.interventions
  for select to authenticated
  using (maintenance.is_staff() or technician_user_id = auth.uid());

create policy interventions_insert on maintenance.interventions
  for insert to authenticated
  with check (maintenance.is_staff() or technician_user_id = auth.uid());

create policy observations_select on maintenance.observations
  for select to authenticated
  using (maintenance.is_staff());

create policy observations_insert on maintenance.observations
  for insert to authenticated
  with check (maintenance.is_staff() and actor_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- restorations / clearances / waits — staff only (Executive/Manager actions).
-- ---------------------------------------------------------------------------

create policy restorations_select on maintenance.restorations
  for select to authenticated using (maintenance.is_staff());
create policy restorations_insert on maintenance.restorations
  for insert to authenticated with check (maintenance.is_staff() and recorded_by = auth.uid());

create policy clearances_select on maintenance.clearances
  for select to authenticated using (maintenance.is_staff());
create policy clearances_insert on maintenance.clearances
  for insert to authenticated with check (maintenance.is_staff() and sent_to_qc_by = auth.uid());

create policy waits_select on maintenance.waits
  for select to authenticated using (maintenance.is_staff());
create policy waits_insert on maintenance.waits
  for insert to authenticated with check (maintenance.is_staff());

-- ---------------------------------------------------------------------------
-- spares — technicians can initiate their own requests; staff can initiate/read all.
-- ---------------------------------------------------------------------------

create policy spare_requests_select on maintenance.spare_requests
  for select to authenticated
  using (maintenance.is_staff() or initiated_by = auth.uid());

create policy spare_requests_insert on maintenance.spare_requests
  for insert to authenticated
  with check (initiated_by = auth.uid());

create policy spare_usage_select on maintenance.spare_usage
  for select to authenticated
  using (maintenance.is_staff() or actor_user_id = auth.uid());

create policy spare_usage_insert on maintenance.spare_usage
  for insert to authenticated
  with check (actor_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- PM — plan approval is Manager-only (§17.3); execution/read is staff.
-- ---------------------------------------------------------------------------

create policy pm_plans_select on maintenance.pm_plans
  for select to authenticated using (maintenance.is_staff());
create policy pm_plans_insert on maintenance.pm_plans
  for insert to authenticated
  with check (maintenance.is_staff() and created_by = auth.uid());

create policy pm_instances_select on maintenance.pm_instances
  for select to authenticated using (maintenance.is_staff());

-- ---------------------------------------------------------------------------
-- recurrence / CAPA — staff read; CAPA owner must be a Manager (§19).
-- ---------------------------------------------------------------------------

create policy recurrence_flags_select on maintenance.recurrence_flags
  for select to authenticated using (maintenance.is_staff());

create policy capa_links_select on maintenance.capa_links
  for select to authenticated using (maintenance.is_staff());
create policy capa_links_insert on maintenance.capa_links
  for insert to authenticated
  with check (maintenance.is_manager() and owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- evidence — any authenticated user involved can attach evidence to a case.
-- ---------------------------------------------------------------------------

create policy evidence_select on maintenance.evidence
  for select to authenticated using (true);
create policy evidence_insert on maintenance.evidence
  for insert to authenticated
  with check (uploaded_by = auth.uid());
