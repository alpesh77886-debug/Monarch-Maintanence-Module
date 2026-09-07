# APPROVAL REPORT — Loops 26-30

**Module:** MONARCH — Maintenance
**Design version:** `IMPLEMENTATION_PACK.md` v0.2 LOCKED
**Batch:** Loops 26, 27, 28, 29, 30
**Date:** 2026-09-07
**Gate:** `IMPLEMENTATION_PACK.md` §19.9 / §19.13 — **autonomous development is
now PAUSED.** Loop 31 does not begin until you explicitly say something
equivalent to *"Approved, continue next 5 loops."*

Previous gate (Loops 21-25) was approved by: *"me aage ki loops ke liye
approve kar raha hu 26 se 30"*.

---

## A. What this batch actually was

Every one of the five loops in this batch found and fixed a real,
live-exploitable security defect — a break from every prior batch, where
most loops closed coverage/dead-code gaps and only some found real bugs.
This batch ran two systematic audit methods back to back, each one
picking up where the last stopped finding anything new:

- **Loops 26-28**: read every RLS policy's live `qual`/`with_check`
  (`pg_policies`, whole `maintenance` schema, one query) against what its
  own migration's comment claims it enforces. This is the exact method
  §H.5 of the Loops 21-25 report flagged as untried.
- **Loops 29-30**: once the RLS sweep was exhausted (every policy in the
  schema read and checked), switched to reading every `SECURITY DEFINER`
  RPC's own internal guards against its own documented intent — the
  same "does the code actually match what it claims to do" method,
  applied one layer down.

Every finding was live-verified against the real Supabase project
(`maavrlqkdrisjwzhjdgg`) with simulated JWTs before being trusted, and
every fix was re-verified live in multiple directions (exploit blocked,
legitimate path preserved, any dependent RPC unaffected) before being
shipped — the same discipline established in every prior batch, applied
five times in a row to genuine defects rather than tidiness gaps.

---

## B. Loop-by-loop

**Loop 26 — RISK-18, `case_assignments` emergency bypass.** Widened Loop
25's one-off RLS check into a systematic sweep. `case_assignments_insert`
(Loop 3) checked `emergency_direct_start AND technician_user_id =
auth.uid()` but never verified the target case was an actual confirmed
emergency. Live-verified genuinely exploitable: a non-staff technician
could self-insert an active assignment row on **any case**, self-granting
intervention/spare-usage rights, bypassing both §5.5 staff-mediated
assignment and §6's two-step emergency confirmation entirely. Fixed
(migration 0025) by requiring the case to actually be
`emergency_confirmed = true`.

**Loop 27 — RISK-19, CRITICAL, `cases_insert` column lockdown.** Applying
the same method to the single most consequential insert policy in the
schema: `cases_insert` had only ever checked `reporter_user_id =
auth.uid()`. Every other column — `status`, all `emergency_*` columns,
`qc_required`, `current_owner_user_id`, `closed_at`, `closure_reason` —
was fully client-writable at INSERT time. Live-verified as a non-staff
user: self-inserted a case with `emergency_confirmed = true` (zero
claim/confirm ceremony) and, separately, a fully-fabricated `status =
'CLOSED'` case with a fake closure reason — bypassing the entire §4
LOCKED lifecycle graph and §6 gate at the root, with zero RPC involvement
and zero real audit trail. This also meant Loop 26's fix was
independently circumventable (fake the emergency here first, then walk
the now-"legitimate" `emergency_direct_start` path). The highest-severity
finding in the project to date. Fixed (migration 0026) by rewriting
`cases_insert` as an allow-list matching exactly the real intake form's
fields, forcing every other column to its safe default.

**Loop 28 — RISK-20, `case_assignments` forged attribution.** Loop 26's
fix closed the emergency-confirmation gap but left
`assigned_by_user_id`/`is_active`/`deactivated_at` client-writable on the
same direct-insert path. Live-verified: a self-service technician could
forge `assigned_by_user_id` to a real staff member's id on a genuinely
confirmed emergency, producing a row that looks staff-mediated but isn't
— defeating the whole point of the direct-start carve-out (that no staff
mediated it). MEDIUM: an audit-trail integrity gap, not a
lifecycle/authority bypass. Fixed (migration 0027) by forcing those three
columns to the only honest state a fresh self-service row can start in.

**Loop 29 — RISK-21, HIGH, `record_spare_usage` skips the ₹12,000 gate.**
Switched audit angle to `SECURITY DEFINER` RPC guards, starting with the
functions touching §3.3's named LOCKED financial-authority boundary.
`record_spare_usage`'s `>₹12,000` Manager-approval check ran only `if
p_spare_request_id is not null` — but that parameter defaults to `NULL`
and nothing forced a caller to supply it. Live-verified: omitting it
skipped the approval gate entirely, and — since `spare_usage` has no
`spare_name` column of its own — also left the row untraceable to any
named spare at all, violating §16.1's "mandatory V1" traceability chain.
**The first finding this batch reachable through the app's own shipped
UI with zero adversarial effort**, not only a direct API call:
`spares-panel.tsx`'s usage form defaulted to an explicit "(not linked to
a request)" dropdown option. Fixed (migration 0028) by requiring
`p_spare_request_id`; UI updated to remove the unsafe default.

**Loop 30 — RISK-22, HIGH, `record_intervention` missing assignment
check.** Continued the RPC audit across the remaining ~40 `SECURITY
DEFINER` functions; most held up correctly. `record_intervention`'s actor
check (Loop 3) was `is_staff() OR p_technician_user_id = v_actor` — never
verifying an actual `case_assignments` row existed, unlike
`record_spare_usage`'s own migration comment, which already described
`record_intervention`'s intent as "staff, or the actively assigned
technician." Live-verified: an unassigned non-staff user could fabricate
an intervention record on any case — compounded by a NULL-propagation bug
where simply omitting `p_technician_user_id` also silently passed the
check (`NULL = v_actor` evaluates to `NULL`, and PL/pgSQL's `if NULL
then` does not raise). This app's UI already gated the form correctly —
pure server-side gap. Fixed (migration 0029) with the same
`case_assignments`-based pattern Loop 29 established.

---

## C. Five real defects found and fixed in this batch

| ID | Loop | Severity | One-line description |
|---|---|---|---|
| RISK-18 | 26 | HIGH | `case_assignments` emergency-direct-start path never checked the case was actually a confirmed emergency |
| RISK-19 | 27 | **CRITICAL** | `cases_insert` let any signed-in user fabricate any case state (including a fake-closed case), bypassing the entire §4 lifecycle graph |
| RISK-20 | 28 | MEDIUM | `case_assignments` self-insert could forge `assigned_by_user_id` to a real staff member, faking staff mediation |
| RISK-21 | 29 | HIGH | `record_spare_usage` let the ₹12,000 approval gate be skipped by omitting the request link — reachable via the shipped UI |
| RISK-22 | 30 | HIGH | `record_intervention` never checked the caller was actually assigned to the case, plus a NULL-propagation bug |

All five are logged in `RISK_REGISTER.md` with full description, live
evidence, and mitigation columns, and all are **RESOLVED** — each fix was
re-verified live in every direction (exploit blocked, legitimate path
preserved, dependent/adjacent RPCs unaffected) before being shipped.

RISK-19 is the most severe defect found in this project to date: it
required no staff access, no RPC, and no prior case state — a single
INSERT statement could fabricate a fully-closed case out of nothing, with
none of the §4 LOCKED lifecycle graph's edges ever consulted.

RISK-21 is the first finding in this project reachable through the
app's own shipped UI with zero adversarial effort — every prior finding
in this batch and the last needed a direct API call bypassing the UI
entirely; RISK-21's exploit was literally the default selection in a
dropdown.

---

## D. Where I deliberately did NOT invent business rules

- **RISK-21's fix (Loop 29).** Requiring `p_spare_request_id` on every
  `record_spare_usage` call is not a new business rule — §16.1 already
  states "Spare usage traceability is mandatory V1" and its chain starts
  with "which spare was used," which `spare_usage` can only answer via
  the linked request (it has no `spare_name` of its own). The fix makes
  the RPC actually enforce what the pack already locks, rather than
  inventing a new threshold or SOP.
- **`cases_insert`'s allow-list (Loop 27).** The fix matches exactly the
  seven fields the real intake form (`cases/new/page.tsx`) already
  submits — no new field was invented as "allowed," and every column not
  in that list is forced to its existing schema default, not a new
  invented default.
- **`evidence_insert`'s broad policy (Loop 28, investigated, deliberately
  left alone).** Found during the RLS sweep that any authenticated user
  can attach evidence to any case, broader than its own comment's "any
  authenticated user *involved*." Confirmed this was already reviewed and
  deliberately accepted in Loop 18 (`evidence-panel.tsx` carries the
  reasoning: reporters need to attach evidence before any staff RPC
  touches the case, and `file_ref` is a reference, not a real upload) —
  not treated as a new finding, and no rule was invented to narrow it.

---

## E. Test and verification state

- **126 tests across 17 files**, all green in real GitHub Actions CI on
  every merged PR this batch (#22, #23, #24, #25).
- Every RLS/RPC change in this batch was verified live against Supabase
  with simulated JWTs — both the exploit (before the fix) and the fix
  (after) — never trusted from reading the migration file alone. Several
  findings (RISK-19, RISK-21, RISK-22) were first suspected from reading
  code, then only confirmed real by successfully reproducing the exploit
  live before any fix was written.
- This sandbox still cannot reach Supabase directly (RISK-05) — `npm
  test` fails all tests identically at the network call here; real signal
  is GitHub Actions CI, every time, as in every prior batch.
- One CI failure this batch was root-caused, not re-run blind: a Loop 26
  test used a "shape only" placeholder UUID for "a different technician"
  that turned out to collide with the real seeded `tech1` identity's own
  id, silently turning an impersonation test into a legitimate self-insert
  and failing the assertion. Fixed by using a genuinely different real
  seeded identity instead of a hand-typed UUID.

---

## F. Process notes, disclosed

- The same repo-configured stop-hook from every prior batch forced
  pushing locally-committed work mid-PR twice in this batch: PR #22 ended
  up carrying the Gate 5 approval log, Loop 26's fix, and the CI
  root-cause fix together. Each time, the PR's title/body was updated to
  honestly describe every piece of content rather than force-pushing
  anything off — same handling as every prior batch.
- Local branch resets: after each PR merged, the local
  `claude/new-session-edkk1u` branch was hard-reset to the newly-merged
  `origin/main` before starting the next loop, keeping every loop's work
  cleanly separated into its own PR (#22 through #25) rather than
  stacking uncommitted history.

---

## G. Open risks carried forward

| ID | Severity | State |
|---|---|---|
| RISK-01 | MEDIUM | OPEN — Production module still has no live schema |
| RISK-02 | HIGH (safety-adjacent) | OPEN — PENDING-01 LOTO/PTW SOP; the non-PENDING seam (§14.2) remains built, the authority matrix is not |
| RISK-03 | LOW | OPEN — PENDING-04 recurrence threshold; mechanism fully configurable end-to-end since Loop 23, still dormant by construction |
| RISK-04 | MEDIUM | OPEN — PENDING-03 granular permission matrix |
| RISK-06 | LOW | OPEN — anon key / Sentry DSN as source fallbacks |
| RISK-05, 07-22 (all named-and-fixed across this project) | — | RESOLVED |

**No CRITICAL or HIGH defect is currently open.**

---

## H. What I'd want you to know before the next batch

1. **This batch found five real, live-exploitable defects in five loops
   — a materially higher hit rate than any prior batch.** That is not
   because the codebase got worse; it's because the audit method changed
   from "is this covered by a test / reachable from the UI" (Loops 16-25)
   to "does this policy's/RPC's actual code match what it claims to
   enforce" (this batch). The second question finds a different, more
   dangerous class of bug: security boundaries that look complete but
   quietly aren't. I'd recommend this method become a standing check, not
   a one-time pass — new RLS policies and RPCs should be read this way
   before being trusted, not just tested for coverage.
2. **RISK-19 (CRITICAL) is now fixed, but it was live in production for
   the entire project until Loop 27** — from Loop 1's very first
   migration until this batch. If any real data was ever entered against
   the live app before this fix, it is worth a manual spot-check of the
   `cases` table for any row that reached `CLOSED` or `emergency_confirmed
   = true` without a corresponding `case_events`/`audit_log` trail — that
   would be the signature of this gap having been exploited (accidentally
   or otherwise) rather than just theoretically present. I have not done
   this check myself since it requires judgment about what counts as
   suspicious versus a legitimate early test row, and did not want to
   flag real Boss/staff activity as suspect without asking first.
3. **The RLS sweep (Loops 26-28) is now exhausted** — every policy in the
   `maintenance` schema has been read against its migration's documented
   intent, and no gaps remain undiscovered by that method as far as one
   pass can tell. The RPC-guard sweep (Loops 29-30) covered roughly
   two-thirds of the ~55 `SECURITY DEFINER` functions in the schema;
   continuing it across the remainder would be a reasonable Loop 31
   candidate if approved.
4. **PENDING-01 (LOTO/PTW SOP) remains the highest-severity open item**,
   unchanged since the last three gate reports.
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

**STOPPED at Loop 30, per `IMPLEMENTATION_PACK.md` §19.9.**

I will not start Loop 31 until you reply with explicit continuation
language. Silence, "looks good," or an unrelated reply is **not**
approval.

Candidates for the next batch if approved: finish the `SECURITY DEFINER`
RPC-guard sweep across the remaining ~15-20 functions not yet read this
batch; the manual spot-check of pre-RISK-19-fix `cases` data noted in
§H.2, if you'd like it done; and any remaining "hand-verified only" items
from earlier gate reports if a safe automated test can be found for them.
