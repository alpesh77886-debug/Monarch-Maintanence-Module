-- MONARCH Maintenance — Loop 22: §10 permanent-repair follow-up responsibility.
--
-- §10 (TEMPORARY RESTORATION): "When entered: record restoration details,
-- preserve evidence, generate/retain permanent-repair follow-up
-- responsibility for Executive, keep case non-closed unless a valid later
-- path completes."
--
-- `maintenance.restorations.follow_up_required` has existed since Loop 1
-- (`0001_maintenance_core_schema.sql`, `not null default false`) — the exact
-- seam for "generate ... follow-up responsibility" — but `record_restoration`
-- never set it. The rest of §10 was already correctly built (Loop 5): the
-- transition graph has no direct TEMPORARILY_RESTORED -> TECHNICALLY_RESTORED
-- edge (RISK-12, regression-tested in qc-and-restoration.test.ts), so the
-- case genuinely cannot close from that state, and FollowUpButton already
-- forces the only valid path back into repair work. What was missing is
-- narrower than the whole of §10: the historical record itself never noted
-- that a follow-up responsibility had been generated, so once a case moved
-- on past TEMPORARILY_RESTORED the fact that it ever needed a stop-gap fix
-- became unrecoverable from anywhere in this schema — a real audit/KPI gap,
-- not a lifecycle-safety one.
--
-- Per the standing RISK-14 process rule, this is a straight edit of the LIVE
-- function definition (pulled via pg_get_functiondef immediately before
-- writing this file), not a rewrite from an old migration copy. Every line
-- besides the one new `follow_up_required` value is byte-identical to what
-- is live today.

create or replace function maintenance.record_restoration(
  p_case_id uuid,
  p_restoration_type text,
  p_details text,
  p_evidence_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = maintenance, public
as $$
declare
  v_actor uuid := auth.uid();
  v_restoration_id uuid;
begin
  if not maintenance.is_staff() then
    raise exception 'FORBIDDEN: only Maintenance staff may record a restoration';
  end if;
  if p_restoration_type not in ('TEMPORARY', 'TECHNICAL') then
    raise exception 'INVALID_TYPE: restoration_type must be TEMPORARY or TECHNICAL';
  end if;

  insert into maintenance.restorations (
    case_id, restoration_type, recorded_by, details, evidence_ref, follow_up_required
  )
  values (
    p_case_id, p_restoration_type, v_actor, p_details, p_evidence_ref,
    -- §10: a TEMPORARY restoration always generates a permanent-repair
    -- follow-up responsibility. Not a human judgement call (unlike a
    -- recurrence threshold) — it is what the pack says happens every time
    -- this restoration type is recorded, so it is set unconditionally here
    -- rather than left for a caller to remember to pass.
    (p_restoration_type = 'TEMPORARY')
  )
  returning id into v_restoration_id;

  if p_restoration_type = 'TEMPORARY' then
    perform maintenance.transition_case(p_case_id, 'TEMPORARILY_RESTORED', p_details, p_evidence_ref);
  else
    perform maintenance.transition_case(p_case_id, 'TECHNICALLY_RESTORED', p_details, p_evidence_ref);
  end if;

  return jsonb_build_object('restoration_id', v_restoration_id, 'case_id', p_case_id,
                             'restoration_type', p_restoration_type);
end;
$$;
