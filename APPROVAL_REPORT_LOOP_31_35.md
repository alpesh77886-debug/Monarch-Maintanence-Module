# APPROVAL REPORT — Loops 31-35

**Module:** MONARCH — Maintenance
**Design version:** `IMPLEMENTATION_PACK.md` v0.2 LOCKED
**Batch:** Loops 31, 32, 33, 34, 35
**Date:** 2026-09-07
**Gate:** `IMPLEMENTATION_PACK.md` §19.9 / §19.13 — **autonomous development is
now PAUSED.** Loop 36 does not begin until you explicitly say something
equivalent to *"Approved, continue next 5 loops."*

Previous gate (Loops 26-30) was approved by: *"approved loops 31 to 35"*.

---

## A. What this batch actually was

A deliberately different shape from the Loops 26-30 batch, where every
single loop found a live-exploitable security defect. This batch finished
the audit methods that batch started, then pivoted to new angles once
each was exhausted — and the hit rate dropped accordingly, which is
itself the headline finding (see §H.1):

- **Loop 31**: finished the `SECURITY DEFINER` RPC-guard sweep Loops
  29-30 started (~25 remaining functions) — clean. Also spot-checked
  whether RISK-18/RISK-19 (both fixed last batch) had ever actually
  affected real data before their fixes — clean.
- **Loop 32**: new angle — read every RLS **SELECT** policy for
  over-broad read-side exposure (every prior loop across two batches had
  only audited write/authority-side policies). Found something, but
  deliberately did not fix it (see §D).
- **Loop 33**: pack cross-reference — read §24/§28/§37 closely against
  actual implementation, same method as Loop 24 (previous batch) — clean.
- **Loop 34**: continued the pack cross-reference into §8 (Observation +
  Action Continuity Journal) — found and fixed a real UI-completeness
  gap on a section explicitly marked "mandatory V1."
- **Loop 35**: continued the pack cross-reference into §15
  (Safety/Technical Stop) — found and fixed a real gap: a mandatory
  notification requirement that was never wired up.

Every finding was live-verified against the real Supabase project
(`maavrlqkdrisjwzhjdgg`) before being trusted, and every fix was
re-verified live in multiple directions before being shipped — same
discipline as every prior batch.

---

## B. Loop-by-loop

**Loop 31 — RPC-guard sweep completion + real-data spot-check, both
clean.** Read the ~25 `SECURITY DEFINER` functions not yet checked in the
Loops 26-30 batch (`close_false_complaint`, `complete_pm_instance`,
`create_recurrence_rule`, `enter_waiting`, `handover_case`,
`raise_capa`, `raise_safety_stop`, `record_root_cause`, `reopen_case`,
`resume_wait`, `run_recurrence_scan`, `verify_capa_effectiveness`, and
others) against their own documented intent. None showed the
RISK-21/RISK-22 shape (an authority gate skippable via an omitted
parameter) or any other guard mismatch — the RPC-guard sweep is now
exhausted across the whole schema (~55 functions, Loops 29-31). Also ran
3 read-only queries (per the Loops 26-30 gate report's own
recommendation) checking whether RISK-19 (fabricated `CLOSED` cases) or
RISK-18 (unconfirmed-emergency assignments) ever affected real data
before their fixes — every flagged row was this project's own
`[AUTOTEST-Lxx]` verification data from Loops 26-27, never real Boss/
staff data.

**Loop 32 — RLS SELECT read-exposure audit, 4 tables open to any
authenticated user.** New angle: prior loops only ever read
write/authority-side RLS. This loop read every SELECT policy in the
schema instead. Found `cases`, `evidence`, `safety_stops`, and
`production_boundary_events` all use `using (true)` — open to any
authenticated user, not staff-scoped. `cases_select`'s own migration
comment claims "All staff can see all open work" but the actual policy
is broader than staff-only. `evidence` was already reviewed and accepted
in Loop 18. Deliberately **not fixed** — see §D.

**Loop 33 — §24/§28/§37 pack cross-reference, clean.** Checked trigger
functions first (only 1 exists in the whole schema, already reviewed),
then read §24 (Automation vs Human Decision), §28 (Idempotency/
Concurrency), and §37 (Test Matrix) closely against actual code/schema/
tests. All three came back clean: §24's security-relevant AUTO/
NEVER-AUTOMATE items match code exactly (e.g. the LOCKED status-
transition graph has no `TEMPORARILY_RESTORED -> CLOSED` edge); §28's
every listed concurrency-sensitive operation uses `for update` or an
atomic `update...where` guard; §37's one uncovered item (no-receiver
handover path) is an already-disclosed Loop 12 manual-verification-only
case, not new.

**Loop 34 — §8 observation journal, 5 of 9 mandatory fields
unreachable.** §8 (marked "mandatory V1 feature") requires 9 fields per
continuity-journal entry. All 9 have existed as columns on
`maintenance.observations` since Loop 1, but `observation-form.tsx` only
ever exposed 4 (`observation`, `action`, `current_condition`,
`next_step`) — `result`, `pending_action`, `blocker`, `intervention_id`,
and `evidence_ref` were silently unreachable through the app since the
feature was first built; every journal entry ever created via the UI had
those five columns permanently NULL. Not an RLS gap — confirmed live that
`observations_insert` never restricted which columns could be set — a
pure UI completeness fix on a section explicitly marked mandatory, and
the read side (`page.tsx`'s journal display) was already built to show
`result`/`pending_action`/`blocker`, it just never had anything to show.
Fixed: the form now has all 9 fields, including an optional
intervention-linkage dropdown; the journal display now also shows the
linked intervention and evidence reference; the `CaseObservation` type
completed to match the table.

**Loop 35 — §15 safety/technical stop, mandatory notification never
sent.** §15: "Immediate Production Manager notification is mandatory"
for a safety/technical stop. Live-verified before any fix: 271 real
stops raised in this project's history, zero notifications of any type
ever tied to any of them, and `SAFETY_STOP_RAISED` wasn't even a member
of the notification type constraint. No Production Manager account
exists in this standalone module (§3.1's two roles are the only ones) —
migration 0015 already solved this exact problem for the closely related
§13.1 breach notification (`record_production_started_without_release`,
same file) by notifying every active `MAINTENANCE_MANAGER` instead,
reasoning "Managers are the escalation authority (§3.2)." That pattern
was simply never applied to `raise_safety_stop` itself, one function
above it in the same file. Not a security/authority bug — the stop's own
gating and recording were always correct. Fixed: migration 0030 applies
the existing substitute-recipient pattern to `raise_safety_stop`.
Live-verified end to end (real case, real manager, exactly one
notification with the right case number/stop type/reason) before writing
the test.

---

## C. Two real gaps found and fixed in this batch (neither security-critical)

| Loop | Section | One-line description | Severity |
|---|---|---|---|
| 34 | §8 (mandatory V1) | Observation journal only exposed 4 of 9 required fields through the UI since the feature was first built | UI completeness — data was never at risk, just unreachable |
| 35 | §15 | `raise_safety_stop` never sent the notification the pack calls mandatory | Missing notification — the stop itself was always correctly gated and recorded |

Neither is logged as a new numbered RISK — both are missing-completeness
gaps rather than security/authority bypasses, matching the precedent set
by Loop 22's `follow_up_required` fix (documented in CHANGELOG/STATUS
only). Contrast with the Loops 26-30 batch's five RISK-18–RISK-22
entries, all live-exploitable authority/lifecycle bypasses.

Loop 32's finding (4 tables with over-broad SELECT policies) is **not**
counted here since it was deliberately not fixed — see §D. It is logged
against RISK-04's existing entry instead.

---

## D. Where I deliberately did NOT invent business rules

- **Loop 32's read-exposure finding.** Narrowing `cases`/`safety_stops`/
  `production_boundary_events`/`evidence` SELECT access would mean
  guessing at PENDING-03's still-unresolved granular permission matrix
  (RISK-04) rather than receiving it from you — and could itself break a
  legitimate need with no evidence either way (e.g. a reporter tracking
  their own case, or plant-wide safety-stop visibility being a genuine
  safety benefit rather than a leak). RISK-04's existing entry was
  updated with the 4 concrete table names and the `cases_select`
  migration-comment-vs-actual-policy mismatch instead, so it's actionable
  the moment you provide guidance.
- **Loop 35's substitute-recipient choice.** Notifying every active
  `MAINTENANCE_MANAGER` instead of a literal "Production Manager" is not
  a new invented rule — it is the exact pattern migration 0015 already
  established for the closely related §13.1 requirement, in the same
  file, reasoned from §3.2's "Managers are the escalation authority."
  This loop only applied an existing precedent to a function that should
  already have had it.
- **Loop 34's field additions.** Every field name, meaning, and column
  already existed in the schema and the pack's §8 text since Loop 1 —
  nothing was invented; the form was simply completed to match what was
  already locked.

---

## E. Test and verification state

- **129 tests across 17 files**, all green in real GitHub Actions CI on
  every merged PR this batch (#27, #28, #29, #30, #31).
- Loop 32 added no tests (a documented finding, not a fix). Loop 33 added
  no tests (a clean cross-reference, no code change). Loop 34 added 1
  test; Loop 35 added 2 tests.
- Every finding this batch was live-verified against Supabase with
  simulated JWTs (role switches via `set_config('request.jwt.claims',
  ...)` + `set role authenticated`, always at the top level of an
  `execute_sql` call, never inside a caught exception block) before being
  trusted — both Loop 34's and Loop 35's fixes were proven working end to
  end against the real project before any test was written.
- This sandbox still cannot reach Supabase directly (RISK-05) — confirmed
  again this batch (Loop 35): the proxy's own status endpoint reports a
  `connect_rejected` / "gateway answered 403" policy denial for
  `maavrlqkdrisjwzhjdgg.supabase.co`, so `npx vitest run` cannot even
  attempt the network call here. `tsc`/`lint`/`build` all run and pass
  locally (no Supabase network required); the actual `vitest run` signal
  is GitHub Actions CI on every PR, as in every prior batch.

---

## F. Process notes, disclosed

- The same repo-configured stop-hook from every prior batch forced
  pushing locally-committed work mid-PR once again this batch: PR #27
  ended up carrying both the Gate 6 approval-log commit and Loop 31's
  work together. The PR's title/body was updated to honestly describe
  both pieces of content, same handling as every prior batch.
- Local branch syncs: after each PR merged, the local
  `claude/new-session-edkk1u` branch was fast-forwarded to the newly
  merged `origin/main` before starting the next loop (#27 through #31),
  keeping every loop's work in its own PR.
- One self-correction worth disclosing: a scheduled check-in message sent
  after Loop 34 mistakenly described it as "the last loop of the Loops
  31-35 batch." It was the 4th of 5. This was caught and corrected before
  any batch-closing work was done — Loop 35 was run in full before this
  report was written, and the task list's own pending item ("Loop 35 +
  gate report") was the thing that caught the error.

---

## G. Open risks carried forward

| ID | Severity | State |
|---|---|---|
| RISK-01 | MEDIUM | OPEN — Production module still has no live schema |
| RISK-02 | HIGH (safety-adjacent) | OPEN — PENDING-01 LOTO/PTW SOP; the non-PENDING seam (§14.2) remains built, the authority matrix is not |
| RISK-03 | LOW | OPEN — PENDING-04 recurrence threshold; mechanism fully configurable end-to-end since Loop 23, still dormant by construction |
| RISK-04 | MEDIUM | OPEN — PENDING-03 granular permission matrix; Loop 32 added concrete evidence (4 `using(true)` tables) to this entry |
| RISK-06 | LOW | OPEN — anon key / Sentry DSN as source fallbacks |
| RISK-05, 07-22 (all named-and-fixed across this project) | — | RESOLVED |

**No CRITICAL or HIGH defect is currently open.**

---

## H. What I'd want you to know before the next batch

1. **This batch's low hit rate is itself the finding.** Two full batches
   (10 loops, 26-35) of systematic security/pack audits have now run:
   write-side RLS (Loops 26-28), RPC guards (Loops 29-31), read-side RLS
   (Loop 32), and pack-section cross-reference (Loops 24, 33-35). Most of
   this batch's loops (31, 33) came back completely clean — a real signal
   that the audit surface for this project's current size is largely
   exhausted by these methods, not that I stopped looking. A sixth batch
   of the same kind of sweep would likely find little.
2. **RISK-04 (permission matrix) now has concrete, actionable evidence**
   from Loop 32 — 4 named tables, one with a migration comment that
   doesn't match its actual policy. This is ready for your decision
   whenever PENDING-03 is resolved; I did not narrow it myself.
3. **Recommendation for the next batch (yours to decide, not mine):**
   given point 1, the next 5 loops might be better spent on either (a)
   the still-OPEN risks that need evidence only you can supply — RISK-02
   (PENDING-01 LOTO/PTW) and RISK-04 (PENDING-03 permission matrix) are
   the two that have been open the longest and are both blocked on the
   same thing, your input, not more autonomous searching — or (b)
   genuinely new feature work rather than continuing the same audit
   angles. I'm not deciding this unilaterally; just flagging it so the
   choice is informed when you give the next approval.
4. **PENDING-01 (LOTO/PTW SOP) remains the highest-severity open item**,
   unchanged since the last four gate reports.
5. Demo logins in `STATUS.md` still need rotation before any real
   rollout — restating again since it still hasn't been actioned.

---

## I. Confirmation on spending

Restating for the record, unchanged since every prior gate: **nothing
paid has been created or upgraded.** Supabase free tier, Vercel Hobby,
Sentry developer tier, GitHub Actions on a public repo. No payment
details entered, no domain purchased, no plan upgraded. I will not take a
billable action without asking first.

---

## J. Gate

**STOPPED at Loop 35, per `IMPLEMENTATION_PACK.md` §19.9.**

I will not start Loop 36 until you reply with explicit continuation
language. Silence, "looks good," or an unrelated reply is **not**
approval.

Candidates for the next batch if approved, per §H.3: your call between
supplying evidence for RISK-02/RISK-04 (unblocking two long-open PENDING
items) or moving to new feature work, given the systematic-audit surface
is now largely exhausted for this project's current size.
