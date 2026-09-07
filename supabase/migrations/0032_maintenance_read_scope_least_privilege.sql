-- ---------------------------------------------------------------------------
-- F-02 / F-03 / F-04 — least-privilege read scope
--
-- Four SELECT policies were `USING (true)`, i.e. readable by ANY authenticated
-- user including one with no maintenance.staff row: cases, evidence,
-- safety_stops, production_boundary_events. Live-verified from pg_policies
-- before this change; every other table in the schema was already scoped.
--
-- Concrete impact: /cases lists the 50 newest cases with no filter, so a
-- non-Maintenance account saw the whole plant's work list — case numbers,
-- symptoms, area, line, priority, owner — plus safety-stop reasons and
-- production-boundary detail.
--
-- The scope below is DERIVED, not guessed. Three constituencies must keep
-- working, each with pack backing:
--   * Maintenance staff see ALL cases — §22's shift-handover dashboard needs
--     plant-wide Maintenance visibility ("total open, Executive-wise
--     pending/completed, unassigned"), and 0002's own comment already states
--     the intent as "All staff can see all open work".
--   * The reporter sees their own case — §5 they report it, §7 they are
--     notified who acknowledged it; they must be able to follow it.
--   * An assigned technician sees the case they are assigned to — §3.1 gives
--     technicians "authenticated execution identities/permissions" and they
--     record interventions/observations against that case.
--
-- This is the shape the schema already uses elsewhere (case_assignments_select
-- and interventions_select are both `is_staff() OR <actor> = auth.uid()`), so
-- it introduces no new authorization concept.
--
-- WRITE policies are deliberately untouched. safety_stops and
-- production_boundary_events keep `with_check (false)` / `using (false)` —
-- they stay RPC-only. Nothing here weakens a write control.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER on purpose, for two reasons:
--   1. it is called from inside the `cases` policy, so it must not re-enter
--      that policy and recurse;
--   2. the evidence / safety_stop / boundary policies must be able to consult
--      cases + case_assignments without being blocked by those tables' own RLS.
create or replace function maintenance.can_read_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = maintenance, public
as $$
  select
    maintenance.is_staff()
    or exists (
      select 1 from maintenance.cases c
      where c.id = p_case_id and c.reporter_user_id = auth.uid()
    )
    or exists (
      select 1 from maintenance.case_assignments a
      where a.case_id = p_case_id and a.technician_user_id = auth.uid()
    );
$$;

comment on function maintenance.can_read_case(uuid) is
  'F-02: single read-scope predicate — Maintenance staff (all cases), the case reporter (own case), or a technician assigned to that case. Case-scoped tables inherit their authorization from this rather than defining their own.';

-- cases: inlined rather than calling can_read_case(id), so the staff and
-- reporter branches cost nothing per row. `(select maintenance.is_staff())`
-- is the documented Supabase idiom that makes the staff check an InitPlan
-- evaluated once per statement instead of once per row — important because
-- /cases scans 50 rows.
drop policy if exists cases_select on maintenance.cases;
create policy cases_select on maintenance.cases
  for select to authenticated
  using (
    (select maintenance.is_staff())
    or reporter_user_id = auth.uid()
    or exists (
      select 1 from maintenance.case_assignments a
      where a.case_id = cases.id and a.technician_user_id = auth.uid()
    )
  );

-- evidence inherits its case's scope (the brief's preferred model).
drop policy if exists evidence_select on maintenance.evidence;
create policy evidence_select on maintenance.evidence
  for select to authenticated
  using ((select maintenance.is_staff()) or maintenance.can_read_case(case_id));

-- safety_stops: operational safety context is not for arbitrary authenticated
-- users. Insert stays `false` (RPC-only) and update stays `false`.
drop policy if exists safety_stops_select on maintenance.safety_stops;
create policy safety_stops_select on maintenance.safety_stops
  for select to authenticated
  using ((select maintenance.is_staff()) or maintenance.can_read_case(case_id));

drop policy if exists production_boundary_events_select on maintenance.production_boundary_events;
create policy production_boundary_events_select on maintenance.production_boundary_events
  for select to authenticated
  using ((select maintenance.is_staff()) or maintenance.can_read_case(case_id));
