# Boss Approval Report — Loops 36–40

Batch opened on the Boss's explicit continuation language ("ye karlo iske baad
you can proceed for 36 to 40 loop"), given alongside the forensic remediation
brief. The remediation was completed first (`FORENSIC_REMEDIATION_FINAL.md`,
PR #36) and this batch followed.

## 1. Honest character of this batch

Read this section before the findings, because the headline count is
misleading on its own.

Three defects were found and two of them were fixed. But:

- **Loop 36 found nothing.** It converted an existing, partly-run checklist
  into a permanent suite. All 17 attacks were already refused.
- **Loop 38's first lead was a false alarm.** PM looked broken (164 approved
  plans, 3 instances) and turned out to be arithmetic. The real finding came
  from a second, unrelated question asked in the same loop.
- **Two of Loop 39's three observations were wrong, and I caught them myself
  before writing them up as findings.** Both are recorded in the CHANGELOG
  because a false finding costs the Boss real attention.

So: five loops, three genuine findings, one of which the Boss must decide
rather than me. That is a lower yield than Loops 26–30 (5 defects in 5 loops)
and closer to Loops 31–35. The audit surface is not inexhaustible, and I would
rather say so than manufacture findings to fill a batch.

## 2. Findings

| Loop | Finding | Severity | Status |
|---|---|---|---|
| 36 | — none | — | Red-team matrix now permanent (17 attacks) |
| 37 | **RISK-25** — an INTERNAL wait can never escalate, structurally | Operationally significant | **OPEN — needs Boss evidence, deliberately not fixed** |
| 38 | **RISK-26** — the same notification delivered twice to the same person | MEDIUM | **RESOLVED** (migration 0035) |
| 39 | **RISK-27** — `take_ownership` built and tested, but no button ever called it | MEDIUM | **RESOLVED** (UI wiring) |

### Loop 36 — red-team matrix made permanent

The forensic brief's Phase 4 matrix had only been partly run (QC authority and
read scope). The rest was never run as a set. All 17 attacks — across non-staff,
QC, Executive and Manager identities — were already refused server-side.

The specific reason to re-attack was that F-01 had just introduced a **new
identity type**, and nothing had checked whether the QC identity could do
Maintenance work through some other RPC. It could not.

Verified live: the ₹12,000 boundary refuses everyone except a Manager
(including the Executive and the new QC identity), lifecycle jumps are refused
with `INVALID_TRANSITION`, and the QC identity has no lateral authority.

### Loop 37 — RISK-25, found and deliberately NOT fixed

`mark_wait_resolved` is the only function that sets `waits.resume_ready_at`,
and it explicitly refuses any wait whose `reason_type <> 'EXTERNAL'`.
`run_escalation_scan` selects only `where resume_ready_at is not null`.

**An INTERNAL wait is therefore structurally incapable of ever escalating.** Not
unlikely — impossible. Live: EXTERNAL 213/213 have `resume_ready_at`, INTERNAL
**0/107**.

It was not fixed because **the pack conflicts with itself, and that conflict is
the finding**:

- §7.2 (the specific WAITING rule) scopes escalation to "**Resume-ready** with
  no required action for 24h" — under that reading the code is exactly correct.
- §23's locked-notification list and §24's AUTO list both say "24h normal
  escalation" with **no** scoping.
- §32 item 15 groups them, leaning toward §7.2.

Closing it requires deciding *when* an INTERNAL wait's 24h clock starts, which
the pack never states. Inventing that is what §19.15 forbids. **This needs Boss
evidence — see §4 below.**

Also verified healthy in the same loop, none of which had ever been checked:
12 of 12 notification types have fired, and **all 393 pg_cron runs across the
three scheduled scans succeeded, zero failures**. That last check matters
because a job that errors on every run looks identical to a working one in
`cron.job`.

### Loop 38 — RISK-26, found and fixed

§23 claims notifications are "event-driven, not spam-driven" and that delivery
"must be idempotent". Rather than trust either, the live table was grouped by
(type, recipient, case) looking for counts above 1.

Three sites sent to the case owner, then looped every active Manager. When the
owner **is** a Manager — normal — that person received two byte-identical rows.

**The evidence ruled out a race:** both duplicate pairs carry timestamps
identical to the **microsecond**, so it was one transaction and one scan pass —
a double-send by construction, not two overlapping cron runs.

Fixed with one deduplicated recipient helper. The risk in that fix was
*dropping* someone, so all four shapes were verified live: owner-is-Manager
1 (was 2); distinct Executive 2, both present; no owner 1; non-staff owner 2.

Existing duplicate rows were **not** deleted — `notifications` is operational
history and this repo does not rewrite history to improve a metric (§27).

**The PM false alarm, recorded because it nearly became a finding:** 164
approved RECURRING plans but only 3 instances and 0 overdue looks exactly like
the Loop 35 defect. Simulating `run_pm_scan`'s own decision showed 0 plans owed
an instance, 0 unflagged past-due instances, and 2 `PM_OVERDUE` notifications
genuinely fired. Frequencies are 14–30 days on a one-day-old database. Correct,
not broken.

### Loop 39 — RISK-27, found and fixed

A new angle: instead of auditing what the code does, cross-referencing all 60
schema functions against whether anything actually **calls** them.

`take_ownership` — named in §28, listed in §24 HUMAN REQUIRED, correct,
race-safe, and tested — was called by **nothing in the application**.

Acknowledging assigns ownership, so a `REPORTED` case was covered. A case that
*loses* its owner was not, and that state is **designed**: §22.1's shift-end
handover sets the owner to NULL when nobody is available, and the dashboard
lists those cases as needing an owner. The app created the state, highlighted
it, and offered no way out. Live: **4 cases were unassigned and past the
acknowledge-able statuses.**

Fixed by wiring the existing RPC to a button. No migration, no RPC change.

**Two self-corrections, both of which would have been false findings:**

1. `mark_asset_known` was flagged as uncalled. True and irrelevant — it is a
   **trigger**, so being uncalled as an RPC is correct, and its behaviour is
   genuinely tested.
2. Five UI-reachable RPCs have no vitest coverage. That is **already documented
   in `tests/pm.test.ts` by Loop 10**, with the reason (instances only come from
   a cron-only scan clients cannot invoke) and the alternative verification
   (live `execute_sql`). Reporting it would have claimed someone else's
   documented decision as a discovery.

## 3. Verification

| Check | Result |
|---|---|
| CI on every merged PR in this batch (#37–#40) | green |
| vitest | 146 → 157 tests, all passing |
| e2e (Playwright, authenticated) | passing |
| `tsc` / `lint` / `build` | clean |
| `"use client"` boundary re-scan | clean (36 files) |
| Migrations added | 0035 only |

## 4. What the Boss must decide — four open items

None of these are engineering work. Each needs evidence or a credential only
the Boss has. **They have not been guessed at.**

| # | Item | Consequence while open |
|---|---|---|
| 1 | **Name the real QC identities** (`maintenance.qc_authority` is empty by design) | QC-required cases stop at `CLEARANCE_PENDING` and cannot complete |
| 2 | **Separate test and production databases**, or accept the current setup | One Supabase project serves both the deployed app and CI. Harmless today (0 real records) but the first real case entered will sit beside CI's test rows |
| 3 | **Enable leaked-password protection** (Supabase dashboard → Auth) | Compromised passwords are accepted at sign-up |
| 4 | **RISK-25: should an INTERNAL wait escalate, and from what instant?** | Internally-blocked work is invisible to escalation forever |

Item 4 is new in this batch. Items 1–3 carry forward from the forensic
remediation.

## 5. Production readiness

**NOT READY**, unchanged from `FORENSIC_REMEDIATION_FINAL.md` §16.

The security posture improved again this batch (a duplicate-delivery defect and
an unreachable-capability defect both closed, and the red-team matrix is now
permanent). But items 1–3 above still block operating on real data, and item 4
is now a fourth open question.

To be explicit about what "NOT READY" does **not** mean: nothing regressed, and
no defect found in this batch was security- or authority-critical. The blockers
are decisions, not unfinished code.

## 6. Gate

**GATE 8 (Loops 36–40) — AWAITING BOSS.**

Autonomous loop work is paused per `IMPLEMENTATION_PACK.md` §19.9/§19.13.
Loop 41 will not start without explicit continuation language. Silence,
"looks good", or an unrelated reply is not approval (§19.13).
