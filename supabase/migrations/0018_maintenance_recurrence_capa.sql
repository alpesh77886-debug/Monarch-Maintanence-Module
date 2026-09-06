-- MONARCH Maintenance — Loop 15: recurrence detection (§18) + CAPA (§19).
--
-- §18 is LOCKED as a HYBRID architecture: evidence tiers, a configurable
-- threshold, and a configurable window. It also says, in as many words:
--
--   "Do not hard-code an unapproved recurrence threshold."
--   "Historical examples may inform configuration but are not automatically
--    the Maintenance rule."
--   The system "may automatically flag `Recurring Failure Suspected` but must
--    NOT automatically declare root cause."
--   "Executive/Manager confirms recurrence status."
--
-- PENDING-04 (the threshold and window) is still open, so this migration ships
-- the mechanism and NO numbers. `recurrence_rules` is created EMPTY and seeds
-- nothing: with no rule rows, `run_recurrence_scan()` reads zero rules and
-- flags nothing. Detection is dormant by construction until a Manager enters
-- a tier, a threshold and a window. That is the only way to build §18 without
-- inventing the very value the pack marks PENDING.
--
-- "Evidence tiers" are likewise not invented here. A tier is a rule row the
-- Manager names and defines; `match_on` is restricted to the fields the schema
-- actually carries (an asset reference, a line, an area), not to a severity
-- ranking I would have had to make up. Every flag records which rule produced
-- it, so a flag always states its own evidence basis.
--
-- §19 CAPA: owner = Maintenance Manager, effectiveness verification =
-- Maintenance Manager. The system "may suggest CAPA candidates, but must not
-- autonomously certify effectiveness" — so a system-suggested CAPA is marked
-- as such, and no code path anywhere sets a verification result.

-- Notification types first — the constraint must allow the new values before
-- any function below writes them (ordering bug hit in migration 0015).
alter table maintenance.notifications
  drop constraint if exists notifications_notification_type_check;

alter table maintenance.notifications
  add constraint notifications_notification_type_check check (notification_type in (
    -- The full existing set, read back from the live constraint rather than
    -- copied from an earlier migration: an earlier draft of this file lost
    -- CASE_ACKNOWLEDGED and WAIT_RESUME_READY that way and Postgres rejected
    -- it against 580 existing rows.
    'CASE_ACKNOWLEDGED',
    'WAIT_RESUME_READY',
    'WAIT_ESCALATION_24H',
    'WAIT_MANAGER_REMINDER_24H',
    'EMERGENCY_ESCALATION_1H',
    'PM_OVERDUE',
    'CASE_HANDOVER_RECEIVED',
    'CASE_UNASSIGNED',
    'PRODUCTION_BOUNDARY_BREACH',
    'RECURRENCE_SUSPECTED',
    'CAPA_ASSIGNED'
  ));

-- ---------------------------------------------------------------------------
-- §18 configuration — deliberately seeded with NOTHING
-- ---------------------------------------------------------------------------

create table maintenance.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  -- The Manager's own name for this evidence tier. Not a taxonomy invented
  -- here; the pack does not define one.
  tier_name text not null,
  -- Restricted to fields the schema genuinely has to match on. Adding a new
  -- one is a schema change, not a free-text guess.
  match_on text not null check (match_on in ('ASSET_REF', 'LINE', 'AREA')),
  -- No DEFAULT on either: PENDING-04. A rule cannot exist without explicit,
  -- human-supplied numbers.
  threshold_count integer not null check (threshold_count >= 2),
  window_days integer not null check (window_days >= 1),
  is_active boolean not null default true,
  created_by uuid not null references maintenance.staff(id),
  created_at timestamptz not null default now(),
  approval_note text not null
);

alter table maintenance.recurrence_rules enable row level security;

create policy recurrence_rules_select on maintenance.recurrence_rules
  for select to authenticated using (maintenance.is_staff());

create policy recurrence_rules_insert on maintenance.recurrence_rules
  for insert to authenticated with check (false); -- RPC-only

-- ---------------------------------------------------------------------------
-- §18 flags — extend the Loop 1 skeleton
-- ---------------------------------------------------------------------------

-- `confirmed boolean` cannot express "dismissed", and keeping both it and a
-- status column would be two sources of truth for one fact. The table is
-- empty (verified before this migration), so it is replaced rather than
-- duplicated.
alter table maintenance.recurrence_flags drop column if exists confirmed;

alter table maintenance.recurrence_flags
  add column if not exists status text not null default 'SUSPECTED'
    check (status in ('SUSPECTED', 'CONFIRMED', 'DISMISSED')),
  add column if not exists rule_id uuid references maintenance.recurrence_rules(id),
  add column if not exists match_value text,
  add column if not exists decision_reason text,
  add column if not exists root_cause_note_by uuid references maintenance.staff(id),
  add column if not exists root_cause_note_at timestamptz;

-- One open flag per (case, rule): the scan runs repeatedly and must not pile
-- up duplicates for a situation nobody has decided on yet.
create unique index if not exists recurrence_flags_one_open_per_case_rule
  on maintenance.recurrence_flags (case_id, rule_id)
  where status = 'SUSPECTED';

alter table maintenance.recurrence_flags enable row level security;

drop policy if exists recurrence_flags_select on maintenance.recurrence_flags;
create policy recurrence_flags_select on maintenance.recurrence_flags
  for select to authenticated using (maintenance.is_staff());

drop policy if exists recurrence_flags_insert on maintenance.recurrence_flags;
create policy recurrence_flags_insert on maintenance.recurrence_flags
  for insert to authenticated with check (false); -- RPC/scan only

-- ---------------------------------------------------------------------------
-- §19 CAPA — extend the Loop 1 skeleton
-- ---------------------------------------------------------------------------

-- Same reasoning as `confirmed` above: a boolean cannot distinguish "not yet
-- verified" from "verified and found NOT effective", and that distinction is
-- the whole point of §19's effectiveness verification.
alter table maintenance.capa_links drop column if exists effectiveness_verified;

alter table maintenance.capa_links
  add column if not exists status text not null default 'OPEN'
    check (status in ('OPEN', 'VERIFIED_EFFECTIVE', 'VERIFIED_NOT_EFFECTIVE')),
  -- §19: the system may SUGGEST. A suggestion is labelled, never certified.
  add column if not exists source text not null default 'HUMAN'
    check (source in ('HUMAN', 'SYSTEM_SUGGESTED')),
  add column if not exists proposed_by uuid references maintenance.staff(id),
  add column if not exists recurrence_flag_id uuid references maintenance.recurrence_flags(id),
  add column if not exists verification_note text;

alter table maintenance.capa_links enable row level security;

drop policy if exists capa_links_select on maintenance.capa_links;
create policy capa_links_select on maintenance.capa_links
  for select to authenticated using (maintenance.is_staff());

drop policy if exists capa_links_insert on maintenance.capa_links;
create policy capa_links_insert on maintenance.capa_links
  for insert to authenticated with check (false); -- RPC-only

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Creating a recurrence rule is what supplies the PENDING-04 numbers, so it is
-- Manager-only and demands a written basis for the values chosen.
create or replace function maintenance.create_recurrence_rule(
  p_tier_name text,
  p_match_on text,
  p_threshold_count integer,
  p_window_days integer,
  p_approval_note text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_rule_id uuid;
begin
  if not coalesce(maintenance.is_manager(), false) then
    raise exception 'FORBIDDEN: only a Maintenance Manager may set a recurrence threshold (18)';
  end if;
  if p_tier_name is null or length(trim(p_tier_name)) = 0 then
    raise exception 'TIER_NAME_REQUIRED: name the evidence tier this rule represents';
  end if;
  -- The pack allows historical examples to *inform* configuration but not to
  -- become the rule by themselves, so the basis must be written down.
  if p_approval_note is null or length(trim(p_approval_note)) = 0 then
    raise exception 'APPROVAL_NOTE_REQUIRED: record the approved basis for this threshold and window (18)';
  end if;
  if p_threshold_count is null or p_threshold_count < 2 then
    raise exception 'INVALID_THRESHOLD: a recurrence threshold must be at least 2 occurrences';
  end if;
  if p_window_days is null or p_window_days < 1 then
    raise exception 'INVALID_WINDOW: a recurrence window must be at least 1 day';
  end if;

  insert into maintenance.recurrence_rules (
    tier_name, match_on, threshold_count, window_days, created_by, approval_note
  ) values (
    p_tier_name, p_match_on, p_threshold_count, p_window_days, v_actor, p_approval_note
  ) returning id into v_rule_id;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'create_recurrence_rule', 'maintenance.recurrence_rules', v_rule_id,
          jsonb_build_object('tier_name', p_tier_name, 'match_on', p_match_on,
                             'threshold_count', p_threshold_count,
                             'window_days', p_window_days), p_approval_note);

  return jsonb_build_object('recurrence_rule_id', v_rule_id);
end;
$$;

create or replace function maintenance.set_recurrence_rule_active(
  p_rule_id uuid,
  p_is_active boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not coalesce(maintenance.is_manager(), false) then
    raise exception 'FORBIDDEN: only a Maintenance Manager may enable or disable a recurrence rule';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED';
  end if;
  if not exists (select 1 from maintenance.recurrence_rules where id = p_rule_id) then
    raise exception 'RULE_NOT_FOUND: %', p_rule_id;
  end if;

  update maintenance.recurrence_rules set is_active = p_is_active where id = p_rule_id;

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'set_recurrence_rule_active', 'maintenance.recurrence_rules', p_rule_id,
          jsonb_build_object('is_active', p_is_active), p_reason);

  return jsonb_build_object('recurrence_rule_id', p_rule_id, 'is_active', p_is_active);
end;
$$;

-- The scan. Flags SUSPECTED only — it never confirms, and it never writes
-- root_cause_note. With no rule rows it does nothing at all, which is the
-- correct behaviour while PENDING-04 is open.
create or replace function maintenance.run_recurrence_scan()
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_rule record;
  v_group record;
  v_flagged integer := 0;
  v_flag_id uuid;
  v_case_ids uuid[];
  v_latest_case uuid;
  v_staff record;
begin
  for v_rule in
    select * from maintenance.recurrence_rules where is_active
  loop
    for v_group in
      -- The match value per case, resolved from whichever field the rule
      -- names. Cases with no value for that field cannot be grouped and are
      -- skipped rather than lumped together under NULL.
      with keyed as (
        select c.id as case_id,
               c.created_at,
               case v_rule.match_on
                 when 'ASSET_REF' then (
                   select a.asset_ref from maintenance.case_assets a
                   where a.case_id = c.id and a.asset_ref is not null
                   order by a.linked_at limit 1
                 )
                 when 'LINE' then c.line
                 when 'AREA' then c.area
               end as match_value
        from maintenance.cases c
        where c.status not in ('DUPLICATE', 'REJECTED')
          and c.created_at >= now() - make_interval(days => v_rule.window_days)
      )
      select match_value,
             array_agg(case_id order by created_at) as case_ids,
             count(*) as occurrences
      from keyed
      where match_value is not null
      group by match_value
      having count(*) >= v_rule.threshold_count
    loop
      v_case_ids := v_group.case_ids;
      v_latest_case := v_case_ids[array_length(v_case_ids, 1)];

      -- The partial unique index makes a second open flag for the same
      -- (case, rule) impossible; skip quietly rather than erroring the scan.
      if exists (
        select 1 from maintenance.recurrence_flags
        where case_id = v_latest_case and rule_id = v_rule.id and status = 'SUSPECTED'
      ) then
        continue;
      end if;

      insert into maintenance.recurrence_flags (
        case_id, related_case_ids, evidence_tier, rule_id, match_value, status
      ) values (
        v_latest_case,
        v_case_ids,
        v_rule.tier_name,
        v_rule.id,
        v_group.match_value,
        'SUSPECTED'
      ) returning id into v_flag_id;

      v_flagged := v_flagged + 1;

      insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
      values (v_latest_case, 'RECURRENCE_SUSPECTED', null,
              'Recurring Failure Suspected (' || v_rule.tier_name || ')',
              jsonb_build_object('recurrence_flag_id', v_flag_id,
                                 'rule_id', v_rule.id,
                                 'match_on', v_rule.match_on,
                                 'match_value', v_group.match_value,
                                 'occurrences', v_group.occurrences,
                                 'threshold_count', v_rule.threshold_count,
                                 'window_days', v_rule.window_days,
                                 'related_case_ids', to_jsonb(v_case_ids)));

      -- §18: a human confirms recurrence status, so every staff member who
      -- could confirm is told. The wording says "suspected" deliberately.
      for v_staff in select id from maintenance.staff where is_active
      loop
        insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
        values (v_staff.id, v_latest_case, 'RECURRENCE_SUSPECTED',
                'Recurring Failure Suspected (' || v_rule.tier_name || '): '
                || v_group.occurrences || ' cases matched ' || v_rule.match_on
                || ' = ' || v_group.match_value || ' within ' || v_rule.window_days
                || ' days. Needs Executive/Manager confirmation.');
      end loop;
    end loop;
  end loop;

  return jsonb_build_object('flags_created', v_flagged);
end;
$$;

revoke execute on function maintenance.run_recurrence_scan() from public, anon, authenticated;

-- §18: "Executive/Manager confirms recurrence status." Both roles are staff,
-- so the staff check is the right gate here — unlike the ₹12,000 approval,
-- the pack does not reserve this to the Manager.
create or replace function maintenance.decide_recurrence_flag(
  p_flag_id uuid,
  p_decision text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_current text;
  v_case uuid;
begin
  if not coalesce(maintenance.is_staff(), false) then
    raise exception 'FORBIDDEN: only Maintenance staff may confirm or dismiss a recurrence flag';
  end if;
  if p_decision is null or p_decision not in ('CONFIRMED', 'DISMISSED') then
    raise exception 'INVALID_DECISION: expected CONFIRMED or DISMISSED';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED: record why this recurrence was confirmed or dismissed';
  end if;

  select status, case_id into v_current, v_case
  from maintenance.recurrence_flags where id = p_flag_id;

  if v_current is null then
    raise exception 'FLAG_NOT_FOUND: %', p_flag_id;
  end if;
  if v_current <> 'SUSPECTED' then
    raise exception 'ALREADY_DECIDED: flag is already %', v_current;
  end if;

  update maintenance.recurrence_flags
  set status = p_decision,
      confirmed_by = v_actor,
      confirmed_at = now(),
      decision_reason = p_reason
  where id = p_flag_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case, 'RECURRENCE_' || p_decision, v_actor, p_reason,
          jsonb_build_object('recurrence_flag_id', p_flag_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'decide_recurrence_flag', 'maintenance.recurrence_flags', p_flag_id,
          jsonb_build_object('status', p_decision), p_reason);

  return jsonb_build_object('recurrence_flag_id', p_flag_id, 'status', p_decision);
end;
$$;

-- §18: the system must NOT automatically declare root cause. There is no code
-- path that writes root_cause_note except this one, and it requires a human
-- actor and their own words.
create or replace function maintenance.record_recurrence_root_cause(
  p_flag_id uuid,
  p_root_cause_note text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_case uuid;
begin
  if not coalesce(maintenance.is_staff(), false) then
    raise exception 'FORBIDDEN: only Maintenance staff may record a root cause';
  end if;
  if p_root_cause_note is null or length(trim(p_root_cause_note)) = 0 then
    raise exception 'ROOT_CAUSE_REQUIRED';
  end if;

  select status, case_id into v_status, v_case
  from maintenance.recurrence_flags where id = p_flag_id;

  if v_status is null then
    raise exception 'FLAG_NOT_FOUND: %', p_flag_id;
  end if;
  -- Root cause belongs to a recurrence somebody has actually confirmed.
  -- Writing one against a merely suspected pattern is the exact thing §18
  -- prohibits the system from doing on its own.
  if v_status <> 'CONFIRMED' then
    raise exception 'NOT_CONFIRMED: confirm the recurrence before recording a root cause (18)';
  end if;

  update maintenance.recurrence_flags
  set root_cause_note = p_root_cause_note,
      root_cause_note_by = v_actor,
      root_cause_note_at = now()
  where id = p_flag_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case, 'RECURRENCE_ROOT_CAUSE_RECORDED', v_actor, p_root_cause_note,
          jsonb_build_object('recurrence_flag_id', p_flag_id));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'record_recurrence_root_cause', 'maintenance.recurrence_flags', p_flag_id,
          jsonb_build_object('root_cause_note', p_root_cause_note), p_root_cause_note);

  return jsonb_build_object('recurrence_flag_id', p_flag_id);
end;
$$;

-- §19: "CAPA owner = Maintenance Manager." Any staff member may propose one,
-- but the owner recorded on it must be a Manager.
create or replace function maintenance.raise_capa(
  p_case_id uuid,
  p_title text,
  p_owner_user_id uuid,
  p_corrective_action text default null,
  p_recurrence_flag_id uuid default null,
  p_source text default 'HUMAN'
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_capa_id uuid;
  v_owner_role text;
begin
  if not coalesce(maintenance.is_staff(), false) then
    raise exception 'FORBIDDEN: only Maintenance staff may raise a CAPA';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'TITLE_REQUIRED';
  end if;
  if p_source not in ('HUMAN', 'SYSTEM_SUGGESTED') then
    raise exception 'INVALID_SOURCE: expected HUMAN or SYSTEM_SUGGESTED';
  end if;
  if not exists (select 1 from maintenance.cases where id = p_case_id) then
    raise exception 'CASE_NOT_FOUND: %', p_case_id;
  end if;

  select role into v_owner_role from maintenance.staff
  where id = p_owner_user_id and is_active;

  if v_owner_role is null then
    raise exception 'OWNER_NOT_STAFF: the CAPA owner must be active Maintenance staff';
  end if;
  if v_owner_role <> 'MAINTENANCE_MANAGER' then
    raise exception 'OWNER_MUST_BE_MANAGER: CAPA owner is the Maintenance Manager (19)';
  end if;

  if p_recurrence_flag_id is not null
     and not exists (select 1 from maintenance.recurrence_flags where id = p_recurrence_flag_id) then
    raise exception 'FLAG_NOT_FOUND: %', p_recurrence_flag_id;
  end if;

  insert into maintenance.capa_links (
    case_id, title, owner_user_id, corrective_action, status, source,
    proposed_by, recurrence_flag_id
  ) values (
    p_case_id, p_title, p_owner_user_id, p_corrective_action, 'OPEN', p_source,
    v_actor, p_recurrence_flag_id
  ) returning id into v_capa_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (p_case_id, 'CAPA_RAISED', v_actor, p_title,
          jsonb_build_object('capa_id', v_capa_id, 'source', p_source,
                             'owner_user_id', p_owner_user_id,
                             'recurrence_flag_id', p_recurrence_flag_id));

  insert into maintenance.notifications (recipient_user_id, case_id, notification_type, message)
  values (p_owner_user_id, p_case_id, 'CAPA_ASSIGNED',
          case when p_source = 'SYSTEM_SUGGESTED'
               then 'CAPA candidate suggested for your review: ' || p_title
               else 'CAPA assigned to you: ' || p_title end);

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'raise_capa', 'maintenance.capa_links', v_capa_id,
          jsonb_build_object('case_id', p_case_id, 'owner_user_id', p_owner_user_id,
                             'source', p_source), p_title);

  return jsonb_build_object('capa_id', v_capa_id, 'status', 'OPEN', 'source', p_source);
end;
$$;

-- §19: "CAPA effectiveness verification = Maintenance Manager" and the system
-- "must not autonomously certify effectiveness". Manager-only, human-called,
-- and it records BOTH outcomes — "verified and not effective" is a real
-- result, not a failure to answer.
create or replace function maintenance.verify_capa_effectiveness(
  p_capa_id uuid,
  p_effective boolean,
  p_verification_note text
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_case uuid;
  v_new_status text;
begin
  if not coalesce(maintenance.is_manager(), false) then
    raise exception 'FORBIDDEN: only a Maintenance Manager may verify CAPA effectiveness (19)';
  end if;
  if p_effective is null then
    raise exception 'EFFECTIVE_REQUIRED: state whether the CAPA was effective';
  end if;
  if p_verification_note is null or length(trim(p_verification_note)) = 0 then
    raise exception 'VERIFICATION_NOTE_REQUIRED: record the evidence for this verification';
  end if;

  select status, case_id into v_status, v_case
  from maintenance.capa_links where id = p_capa_id;

  if v_status is null then
    raise exception 'CAPA_NOT_FOUND: %', p_capa_id;
  end if;
  if v_status <> 'OPEN' then
    raise exception 'ALREADY_VERIFIED: CAPA is already %', v_status;
  end if;

  v_new_status := case when p_effective then 'VERIFIED_EFFECTIVE' else 'VERIFIED_NOT_EFFECTIVE' end;

  update maintenance.capa_links
  set status = v_new_status,
      effectiveness_verified_by = v_actor,
      effectiveness_verified_at = now(),
      verification_note = p_verification_note
  where id = p_capa_id;

  insert into maintenance.case_events (case_id, event_type, actor_user_id, reason, metadata)
  values (v_case, 'CAPA_EFFECTIVENESS_VERIFIED', v_actor, p_verification_note,
          jsonb_build_object('capa_id', p_capa_id, 'status', v_new_status));

  insert into maintenance.audit_log (actor_user_id, action, target_table, target_id, after, reason)
  values (v_actor, 'verify_capa_effectiveness', 'maintenance.capa_links', p_capa_id,
          jsonb_build_object('status', v_new_status), p_verification_note);

  return jsonb_build_object('capa_id', p_capa_id, 'status', v_new_status);
end;
$$;

-- Hourly, alongside the PM scan. Harmless while no rules exist.
select cron.schedule(
  'maintenance-recurrence-scan',
  '7 * * * *',
  $$select maintenance.run_recurrence_scan();$$
);
