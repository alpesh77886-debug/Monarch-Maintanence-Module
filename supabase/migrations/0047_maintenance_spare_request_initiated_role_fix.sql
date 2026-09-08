-- Loop 46 — triggers/constraints enumerate-first sweep.
--
-- Method: this schema has exactly ONE trigger (case_assets_mark_known, AFTER
-- INSERT on case_assets) and 24 CHECK constraints. Both were enumerated and
-- read in full rather than sampled. The trigger is correctly scoped (its
-- effect only follows an already staff-authorized insert, matching
-- case_assets_insert's WITH CHECK). 23 of the 24 CHECK constraints match their
-- business rule exactly, and a cross-check of every notification_type literal
-- used across every migration against notifications_notification_type_check's
-- 12-value list found zero mismatches.
--
-- The one real finding: spare_requests.initiated_role.
--
-- raise_spare_request set it with:
--     case when maintenance.is_staff() then 'EXECUTIVE' else 'TECHNICIAN' end
--
-- is_staff() is true for BOTH maintenance software roles (§3.1:
-- MAINTENANCE_EXECUTIVE and MAINTENANCE_MANAGER), so a Manager-raised spare
-- request was recorded as if an Executive raised it. initiated_by (the actor
-- uuid) was always correct; only the human-readable role label was wrong.
--
-- Proven live: signed in as the seeded Manager identity, raise_spare_request
-- inserted a row with initiated_by = the Manager's own uuid and
-- initiated_role = 'EXECUTIVE'.
--
-- This is not a security defect — approval routing (requires_manager_approval)
-- is derived from estimated_amount vs the SS3.3 Rs.12,000 boundary, entirely
-- independent of initiated_role. It is a SS16.3 / SS29 audit-trail accuracy
-- defect, and it is user-visible: spares-panel.tsx renders
-- "Requested by {initiated_role.toLowerCase()}", so a Manager's own request
-- displayed the wrong actor's role to whoever read the case.
--
-- SS16.3 names only Technician (direct) and Executive (relayed) as the two
-- initiation paths, and does not mention Manager. Restricting
-- raise_spare_request to Executives only would be inventing an authority
-- restriction the pack never states — SS3.2 gives Manager override authority
-- over Executive decisions, never says Manager cannot do what Executive does.
-- So the fix records the role that already exists rather than inventing a
-- new restriction: maintenance.current_staff_role() already returns the exact
-- staff role and was available before this fix; it was simply never used here.

alter table maintenance.spare_requests drop constraint spare_requests_initiated_role_check;
alter table maintenance.spare_requests add constraint spare_requests_initiated_role_check
  check (initiated_role = any (array['TECHNICIAN', 'EXECUTIVE', 'MANAGER']));

create or replace function maintenance.raise_spare_request(
  p_case_id uuid,
  p_spare_name text,
  p_quantity_requested numeric,
  p_estimated_amount numeric default null,
  p_intervention_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid;
  v_requires_approval boolean;
  v_initiated_role text;
  v_staff_role text;
begin
  if p_spare_name is null or length(trim(p_spare_name)) = 0 then
    raise exception 'SPARE_NAME_REQUIRED: a spare name/description is mandatory';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  -- §3.3: basis is Total Budget / Invoice Total Amount, boundary is exactly
  -- ₹12,000 (not the older ₹10,000 figure). No amount given -> treated as
  -- not yet priced, so it cannot trigger the Manager-authority gate; the
  -- gate re-evaluates once a real amount is known (nothing here forces one
  -- to be supplied at request time, since it may not be known yet).
  v_requires_approval := coalesce(p_estimated_amount, 0) > 12000;

  v_staff_role := maintenance.current_staff_role();
  v_initiated_role := case
    when v_staff_role = 'MAINTENANCE_MANAGER' then 'MANAGER'
    when v_staff_role = 'MAINTENANCE_EXECUTIVE' then 'EXECUTIVE'
    else 'TECHNICIAN'
  end;

  insert into maintenance.spare_requests (
    case_id, intervention_id, spare_name, quantity_requested, initiated_by,
    initiated_role, estimated_amount, requires_manager_approval
  ) values (
    p_case_id, p_intervention_id, p_spare_name, p_quantity_requested, v_actor,
    v_initiated_role, p_estimated_amount, v_requires_approval
  ) returning id into v_request_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, metadata)
  values (
    p_case_id, 'SPARE_REQUESTED', v_actor,
    jsonb_build_object(
      'spare_request_id', v_request_id, 'spare_name', p_spare_name,
      'quantity_requested', p_quantity_requested, 'estimated_amount', p_estimated_amount,
      'requires_manager_approval', v_requires_approval
    )
  );

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after)
  values (v_actor, 'raise_spare_request', 'maintenance.spare_requests', v_request_id,
          jsonb_build_object('case_id', p_case_id, 'requires_manager_approval', v_requires_approval));

  return jsonb_build_object(
    'spare_request_id', v_request_id, 'case_id', p_case_id,
    'requires_manager_approval', v_requires_approval
  );
end;
$$;
