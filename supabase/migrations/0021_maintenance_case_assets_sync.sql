-- MONARCH Maintenance — Loop 20: asset/machine linkage (§5.1).
--
-- §5.1: "Exact asset may be unknown at creation. Never silently map an
-- unknown asset. A case may later be linked to one or more assets/machines."
-- `maintenance.case_assets` has existed since Loop 1 with correct RLS since
-- Loop 2 (staff-only insert, `linked_by = auth.uid()`) — but nothing has
-- ever written to it. The intake form (cases/new) has offered a checkbox
-- reading "link it after acknowledgement" since it was built, and there has
-- never been anywhere to actually do that. It is also why the recurrence
-- engine's `ASSET_REF` match tier (Loop 15) could never produce a match: no
-- case has ever had a case_assets row to match on.
--
-- No RPC needed here — same shape as evidence (Loop 18): the existing INSERT
-- policy already grants exactly the right authority, so this is a direct
-- client insert like the other RPC-free tables.
--
-- The one genuine addition is this trigger. `cases.asset_known` is set once
-- at intake and, until now, never touched again — meaning a case reported
-- with "asset unknown" stayed permanently marked that way even after staff
-- identified and linked the real asset. That is not a business rule change;
-- it is keeping one existing flag honest about data that already exists
-- elsewhere in the row's own case. §5.1's "never silently map an unknown
-- asset" is about not guessing WHICH asset — it says nothing about the
-- boolean staying accurate once a real link is made, and leaving it stale
-- would make the flag actively misleading rather than merely unused.
create or replace function maintenance.mark_asset_known()
returns trigger
language plpgsql
security definer
set search_path = maintenance, public
as $$
begin
  update maintenance.cases set asset_known = true where id = new.case_id;
  return new;
end;
$$;

create trigger case_assets_mark_known
  after insert on maintenance.case_assets
  for each row
  execute function maintenance.mark_asset_known();
