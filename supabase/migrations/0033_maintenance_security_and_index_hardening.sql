-- ---------------------------------------------------------------------------
-- F-08 — search_path hardening; F-09 — justified indexes only.
--
-- F-08: is_staff() and is_manager() (0002/0010) are plain `stable sql`
-- functions with no `set search_path`, which Supabase's linter flags as
-- function_search_path_mutable. Honest severity: this is NOT an open bypass.
-- Both are SECURITY INVOKER, their single call is schema-qualified, and the
-- callee current_staff_role() is already SECURITY DEFINER with a pinned
-- search_path — an attacker would need CREATE on the maintenance schema to
-- shadow it. Pinned anyway because it is free and closes the lint. Business
-- meaning is identical: same bodies, same results.
--
-- F-09: only three indexes are added. Of the tables missing a case_id index,
-- exactly these three are queried by case_id on the case-detail page
-- (evidence, capa_links, case_assets). notifications, idempotency_keys and
-- pm_instances also lack one but are NOT filtered by case_id anywhere —
-- indexing them would be the "blindly index every FK" the brief warns against.
-- ---------------------------------------------------------------------------

create or replace function maintenance.is_staff()
returns boolean
language sql
stable
set search_path = maintenance, public
as $$
  select maintenance.current_staff_role() is not null;
$$;

create or replace function maintenance.is_manager()
returns boolean
language sql
stable
set search_path = maintenance, public
as $$
  select coalesce(maintenance.current_staff_role() = 'MAINTENANCE_MANAGER', false);
$$;

create index if not exists evidence_case_id_idx on maintenance.evidence (case_id);
create index if not exists capa_links_case_id_idx on maintenance.capa_links (case_id);
create index if not exists case_assets_case_id_idx on maintenance.case_assets (case_id);
