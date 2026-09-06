# APPROVAL REPORT — Loops 11-15

**Module:** MONARCH — Maintenance
**Design version:** `IMPLEMENTATION_PACK.md` v0.2 LOCKED
**Batch:** Loops 11, 12, 13, 14, 15
**Date:** 2026-09-06
**Gate:** `IMPLEMENTATION_PACK.md` §19.9 / §19.13 — **autonomous development is
now PAUSED.** Loop 16 does not begin until you explicitly say something
equivalent to *"Approved, continue next 5 loops."*

Previous gate (Loops 06-10) was approved by you with
*"suru karo...loop 11 se 15 suru karo"*.

---

## A. What was built

| Loop | Area | Pack section |
|---|---|---|
| 11 | Browser E2E (Playwright) wired into CI as its own job | §37-39 test evidence |
| 12 | Shift handover / staff availability | §22 |
| 13 | Production restart boundary — safety stops, §13.1/§13.2 recording | §13 |
| 14 | KPI reporting + production impact capture | §25 |
| 15 | Recurrence detection + CAPA | §18, §19 |

Migrations `0014` → `0018` applied to Supabase project `maavrlqkdrisjwzhjdgg`,
each verified live before its PR was pushed. PRs #7-#10 merged; the Loop 15 PR
is the last of this batch.

---

## B. The single most important result in this batch

**Loop 11 closed RISK-05, which had been open since Loop 1** — and it was open
because of a wrong assumption I had been carrying for ten loops.

I had treated "this sandbox's proxy blocks `*.supabase.co`" as meaning browser
tests could not run *at all* without a human on another machine. That was
wrong. **GitHub Actions has normal egress**, and the Vitest suite had already
been signing in against live Supabase from CI since Loop 6. Moving Playwright
into CI closed the gap immediately: 8/8 green, all four sign-in flows passing
on the first run.

Worth stating plainly: the two worst defects of the whole project so far —
RISK-10 (login completely broken in production) and RISK-12 (a dead-end button
on a core flow) — both hid in exactly the gap that this had left open. The UI
layer is now covered on every push.

---

## C. Defects found and fixed in this batch

Four, two of them serious. None were reported by you; all were found here.

### RISK-15 — a view read straight past RLS (HIGH, Loop 14)

`case_current_impact` is the **first view in this schema**, and it shipped with
Postgres's default behaviour: a view executes with its *owner's* privileges,
and the owner (`postgres`) is not subject to RLS. It bypassed the `is_staff()`
policy on the table underneath and exposed every case's production-impact data
to any authenticated user, including the non-staff technician identity.

I measured it rather than assuming it. With 2 impact rows present:

| Read as the non-staff technician JWT | Rows returned |
|---|---|
| identical probe view **without** `security_invoker` | **2** |
| base table (RLS applies) | 0 |
| `case_current_impact` after the fix | 0 |

The probe view was dropped immediately after the measurement (verified gone).
Fixed in `0017`. Permanent regression test added.

**Standing rule now recorded for this repo: every reporting view over an
RLS-protected `maintenance` table must set `security_invoker`, or the policy
underneath it is decorative.** This is the first view, so this is the moment
the precedent gets set.

### RISK-16 — CI was red for a real reason (MEDIUM, Loop 14)

PR #9 came back **45 passed / 8 failed**, every failure at `signInWithPassword`
with *"Request rate limit reached"*. Not a flake, and re-running would only
have moved the failure to a different file.

Two causes, both mine:

1. `signInAs` signed in fresh on every call. At 78 call sites that was ~78
   requests to Supabase's auth endpoint in ~80 seconds from one CI IP — over
   the rate limit, and getting worse with every test added. Now one signed-in
   client is cached per role: 3 sign-ins per run.
2. `push: branches: ["**"]` plus `pull_request` ran **two identical workflows
   per PR commit**, doubling that load and running two suites against the same
   live Supabase project simultaneously. Push now covers `main` only, with a
   `concurrency` group cancelling superseded runs.

Next run: a single workflow, 61/61 green.

### A migration rejected by Postgres (Loop 15)

Migration `0018`'s first apply was refused: the notification-type constraint
was violated by 580 existing rows. I had rebuilt the type list by copying from
an earlier migration at a line offset that silently dropped
`CASE_ACKNOWLEDGED` and `WAIT_RESUME_READY`. Transaction rolled back cleanly;
the list is now read from the live constraint. **Same class of mistake as
RISK-14** — rebuilding a definition from a stale copy instead of the live
object. Worth noting the pattern has now bitten twice.

### Type drift (Loop 15)

`NotificationType` was missing four values that live RPCs had been writing
since Loops 10-13. The type was quietly narrower than the database. Corrected.

---

## D. Where I deliberately did NOT invent business rules

This is the part I most want you to check, because these are judgement calls
where inventing something would have looked like more complete work.

**§18 recurrence threshold (PENDING-04) — the big one.** §18 says *"Do not
hard-code an unapproved recurrence threshold."* So Loop 15 ships the mechanism
with **no numbers**. `recurrence_rules` is created empty and seeds nothing;
with no rules the scan flags nothing. Recurrence detection is **dormant by
construction** and stays dormant until you supply a threshold and window. A
test asserts no active rule exists, so a future change that quietly seeds a
default will fail CI.

I also did not invent an "evidence tier" taxonomy. The pack names evidence
tiers but does not define them, so a tier is a rule row *you* name, and
matching is restricted to the three fields the schema actually has
(`ASSET_REF`, `LINE`, `AREA`).

**No root cause, ever, from the system.** §18 permits auto-flagging *"Recurring
Failure Suspected"* and forbids auto-declaring root cause. The scan writes
`SUSPECTED` only; no code path writes a root cause except one that requires a
human, their own words, and a flag a human already confirmed.

**No CAPA self-certification.** §19 lets the system suggest and forbids it
certifying effectiveness. A system-proposed CAPA is stored and displayed as
*"suggested — not certified"*.

**No KPI targets or SLAs (§25.2).** Nothing on the `/kpi` page is coloured
good/bad or compared to a threshold. The dashboard shows case **age**, never
"overdue" — no case-level SLA exists in the locked design.

**No ₹ cost-of-maintenance headline (§24, §25.2).** Spare amounts are
Maintenance-entered *estimates*, not an authoritative costing, and §24 lists
fabricating financial impact as NEVER AUTOMATE. Estimates are shown labelled,
and unpriced requests are counted separately rather than folded in as ₹0.

**No zero-filling (§25.2).** An unrecorded downtime figure is stored as NULL
and rendered as the words *"not recorded"*. Every KPI carries a coverage line.
§18 recurrence and §19 CAPA appear on the KPI page as **unbuilt** rather than
as zero — reporting "0 repeat failures" from a detector that does not exist
would be false.

---

## E. Test and verification state

- **70 tests across 11 files**, all green in real GitHub Actions CI.
- **8 Playwright browser tests** green in CI (RISK-05 closed).
- Every RPC in this batch verified live against Supabase with simulated JWTs
  before shipping — full result tables in `CHANGELOG.md` per loop.
- This sandbox cannot reach Supabase, so `npm test` here fails all 70
  identically at the network call. **Real pass/fail is CI, not this
  environment.** I have not once reported a sandbox run as evidence of
  correctness.

**Still verified only by hand, not in the suite** (both because the functions
are cron-only and unreachable by any client without a test-only backdoor I
declined to build):

- escalation timer *durations* (24h/1h) — Loop 7
- PM instance lifecycle + scan generation — Loop 10
- the recurrence scan creating a flag — Loop 15

---

## F. Honest statement of what this is not

A green build is not a correct product. What I can defend:

- The lifecycle, RBAC, ₹12,000 boundary, QC gate, WAITING overlay, emergency
  two-step and production boundary are enforced **server-side** and have live
  evidence behind them.
- What I cannot defend is anything depending on the five PENDING items. In
  particular **recurrence detection is built but inert** — it will do nothing
  at all until you supply PENDING-04.

Also unchanged: **no plant SOP, LOTO/PTW authority, SLA or recurrence
threshold has been invented** anywhere in this batch.

---

## G. Open risks carried forward

| ID | Severity | State |
|---|---|---|
| RISK-01 | MEDIUM | OPEN — Production module still has no live schema; cross-refs remain forward-looking only |
| RISK-02 | HIGH (safety-adjacent) | OPEN — PENDING-01 LOTO/PTW SOP; only seam columns exist, no authority invented |
| RISK-03 | LOW | OPEN — PENDING-04 recurrence threshold; mechanism now built and dormant |
| RISK-04 | MEDIUM | OPEN — PENDING-03 granular permission matrix |
| RISK-06 | LOW | OPEN — anon key / Sentry DSN as source fallbacks (both non-secret by their platform's model) |
| RISK-05, 08-16 | — | RESOLVED |

**No CRITICAL or HIGH defect is currently open.**

---

## H. What I need from you

Nothing is required for the code to stand as it is. Two things would unblock
real work:

1. **PENDING-04 — recurrence threshold and window.** Until you supply these,
   §18 detection stays inert. When you do, a Manager enters them through the
   UI/RPC with a written basis; nothing needs redeploying.
2. **PENDING-01 — LOTO/PTW plant SOP.** RISK-02 is the highest-severity open
   item in the register and is safety-adjacent. I have deliberately built no
   authority model here.

Also worth your attention: the demo logins in `STATUS.md`
(`exec1@monarch.test` etc., all sharing one password) must be rotated or
removed before any real rollout.

---

## I. Confirmation on spending — asked and answered

You asked me to confirm I had not subscribed to anything that would bill you.
Restating it here so it is on the record in the repo:

**Nothing paid has been created or upgraded at any point.** Supabase (free
tier), Vercel (Hobby, team `Monarch`), Sentry (developer tier) and GitHub
Actions on a public repo. I have not entered payment details, bought a domain,
or upgraded a plan. **I will not take any billable action without asking you
first**, and I would flag it before acting, not after.

---

## J. Gate

**STOPPED at Loop 15, per `IMPLEMENTATION_PACK.md` §19.9.**

I will not start Loop 16 until you reply with explicit continuation language.
Per CLAUDE.md, silence, "looks good", or an unrelated reply is **not**
approval.

Next up if approved (§32 remaining items): evidence/attachment handling (§28),
the planned maintenance window / production dependency area (§20), and
hardening the items in §E that are still hand-verified only.
