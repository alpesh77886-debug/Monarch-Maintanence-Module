Project: MONARCH — Maintenance Module
Current approved design version: v0.2 LOCKED
Current loop: GATE 13 STOP (Loops 61-65 complete) - mandatory 5-loop
  checkpoint per Section 19.9/19.13. Autonomous loop work is PAUSED,
  AWAITING BOSS explicit continuation language before Loop 66 - even
  though the Boss pre-approved the full 61-70 range, the hard-stop-
  and-report requirement is independent of that pre-approval per this
  project's own non-negotiable governance rule. Loop 65 added the
  final two pieces of the core mobile UX journey this batch targeted:
  case-lifecycle-strip.tsx (a compact, read-only view of the locked
  transition graph - display only, never a second source of truth,
  branch/exception statuses shown as a distinct callout rather than
  forced onto the linear happy path) and a "NEXT ACTION" eyebrow label
  above the sticky primary-action bar (shown only for a real lifecycle-
  advancing action, not Hand Over alone). Live-render verified across
  6 real statuses via DOM query (not just a screenshot, since the strip
  scrolls past mobile viewport width). See APPROVAL_REPORT_LOOP_61_65.md
  for the full batch summary and honest progress-vs-estimate check
  against Loop 61's 18-26-additional-loop projection.
Previously: Loop 64 complete - rebuilt cases/page.tsx from a plain
  .map() list into a work queue (Prompt section 8, mockup Screen 003):
  search box (plain GET form, no client JS, filters in JS after fetch
  rather than a PostgREST .or() string - a symptom can legitimately
  contain a comma/parenthesis that would break or-filter syntax),
  status filter chips with live counts derived from what's actually
  present in the data (never hardcoded), urgency-first sort (active
  emergency claim first, then unassigned, then HIGH priority, ties
  oldest-first - all real fields, nothing inferred, no case-level SLA
  exists to sort by instead), age per row, and a FAB replacing the
  header's "+ Report case" link. tsc/eslint/build clean; checked e2e
  for anything clicking the old header button or inspecting list
  markup - none exists.
Previously: Loop 63 complete - relabeled AppNav's bottom tab bar to
  match the mockup's own in-app tab bar exactly: Cases, Control (was
  "Shift", same /dashboard route, no new screen invented), PM, Spares
  (new, links to Loop 62's /spares), More (new). Recurrence and KPIs
  don't fit the 5-slot bar anymore - folded into a new /more page
  (staff-gated menu, Prompt section 17's "secondary controls live in a
  surface such as More"), neither page's own content touched. My Work
  now shows case age (same formatAge convention as the shift
  dashboard). PR #61 (Loops 61-62) needed two real fixes before CI went
  green: login/page.tsx still had a hardcoded router.replace("/cases")
  Loop 62 missed (6 e2e failures, all signIn() timeouts - fixed in
  c7183cf), and the Home module tiles' accessible link name wasn't
  exactly "PM" since it included the tile's description text (1 e2e
  failure - fixed in 8f43525 with aria-label, also a genuine
  accessibility improvement). Both were real regressions this session's
  own e2e suite caught, not flakes - confirmed by reading the actual
  failure logs before touching anything. Merged. Live-render verified
  the new nav via the Loop 53 technique. tsc/eslint/build clean.
Previously: Loop 62 complete - built the new Module Hub post-login
  landing page (Prompt Section 47, mockup Screen 002): src/app/home/
  page.tsx + home-client.tsx, replacing the old direct-to-/cases
  redirect. 2-column module tiles (Cases, Shift, PM, Spare Consumption,
  My Work, Emergency) with real single-purpose-query badges (open
  cases, my open cases, PM overdue, spare approvals pending, active
  emergency claims - nothing fabricated), shift banner sourced from the
  real is_available toggle, quick actions, hamburger-triggered side
  drawer (Work/Preferences/Account). A signed-in non-staff identity
  (the demo technician login) gets a reduced hub - Cases tile only,
  mirroring AppNav's own staff gating - not a crash or a silently full
  hub; fixed an e2e regression this caused (roles-and-notifications.spec.ts
  expects zero "PM" links for a non-staff user) before it could reach CI.
  Built 3 new minimal-but-real landing routes the hub links to since
  none existed before: /spares, /emergency (reads the real
  emergency_claimed/emergency_confirmed flags - there is no "EMERGENCY"
  priority tier in the locked schema, so this does not invent one),
  /my-work. Added a real, working light/dark theme toggle (Prompt
  Section 47 "Theme Setting") - a data-theme attribute flips Loop 50's
  already-centralized CSS custom properties, so every existing
  bg-card/text-fg/... utility repaints for free, FOUC-safe via a
  blocking init script. proxy.ts/page.tsx redirect targets changed from
  /cases to /home; e2e/helpers.ts's signIn() updated to match.
  Live-render verified via the Loop 53 throwaway-route+proxy-bypass
  technique: initial hub, drawer open, both theme states screenshotted
  at 390x844, zero console/hydration errors, light theme repaints
  correctly. tsc/eslint/build all clean. Nav relabeling (AppNav's
  bottom bar) is explicitly Loop 63's scope, not touched here.
Previously: Loop 61 complete - Boss supplied a new 47-section Mobile UX
  Reconstruction Prompt V2 plus an ENTERPRISE V3 screen-mockup HTML
  reference, and approved Loops 61-70 to begin this work (a full
  navigation/IA + Control Tower + Case Queue + Case Detail cockpit +
  design-system reconstruction, NOT a cosmetic pass). Per the prompt's
  own Section 5/25 (forensic inspection before code, small auditable
  steps) - which also matches this project's own established
  map-before-implement convention (Loop 54's Blueprint Gap Matrix) -
  Loop 61 was pure forensic inspection + gap mapping, no code changed.
  Confirmed real gaps against real evidence: no Module Hub/home route
  exists (lands on /cases directly), no side drawer, Case Queue has no
  search/filter/urgency-sort (86-line plain list), no /spares or
  /emergency or /my-work routes exist at all, Case Detail lacks a
  lifecycle-journey strip and single-dominant-next-action framing (Loop
  51 already did the tabs/sheets restructure, so this is a delta not a
  rebuild from zero), no standardized loading-skeleton/empty-state
  component exists. See MOBILE_UX_RECONSTRUCTION_GAP_MAP.md for the full
  evidence table, per-screen implementation plan, and an honest,
  evidence-grounded loop-count estimate for the FULL 47-section
  enterprise bar: roughly 18-26 additional loops (through approximately
  Loop 80-87), not 70 - the approved 61-70 batch lands the highest-
  leverage core journey (Module Hub, relabeled nav, Case Queue, Case
  Detail's cockpit delta, shared component foundation) but not full
  21-screen/full-accessibility/full-desktop propagation in one batch,
  consistent with the prompt's own instruction not to spread effort
  across every page before the core journey works. This estimate will be
  refreshed with real evidence at Loop 65 and Loop 70, not treated as a
  fixed promise.
Previously: GATE 12 STOP (Loops 56-60 complete) - mandatory 5-loop
  checkpoint per Section 19.9/19.13. Autonomous loop work is PAUSED,
  AWAITING BOSS explicit continuation language before Loop 61. Loop 56
  found RISK-32 (CRITICAL - reopen_case only checks is_staff(), not the
  LOCKED "Executive + Manager" rule) and RISK-33 (MEDIUM - complainant-
  disagreement joint-decision path has zero implementation), both OPEN
  and awaiting a Boss decision on the exact mechanism (see
  APPROVAL_REPORT_LOOP_56_60.md for the specific questions). Loop 60 (the
  PM screen fix, below) shipped without waiting since it was an
  unambiguous bug fix, not a design decision. See
  APPROVAL_REPORT_LOOP_56_60.md and APPROVAL_GATE.md.
Previously: Loop 60 - the Boss
  reported the /pm screen live, in Hinglish: bottom nav's 5 options
  became 4 on click, and the screen stopped looking like a mobile app.
  AppNav itself is a static 5-item array (confirmed by reading it first,
  before touching anything) - root cause was a React hydration mismatch:
  pm-plan-card.tsx and pm-instance-card.tsx formatted approved_at/due_at/
  overdue_since with a bare toLocaleString(), which renders differently
  on the server (container, UTC) than the client browser (plant floor,
  IST). React discards and re-renders the mismatched subtree on
  hydration, which visibly broke the page on load. Reproduced locally
  with a throwaway dummy-data route mirroring /pm's real component tree
  (deleted before commit, plus the local-only proxy.ts bypass reverted -
  confirmed via `git status --short`) - the Next.js dev "N - 1 Issue"
  overlay rendered directly on top of the fixed bottom nav, covering the
  Cases icon, visually matching the Boss's report exactly. Fixed with a
  new src/lib/format.ts (formatIst(): fixed "en-IN" locale + "Asia/
  Kolkata" timeZone so the string is identical wherever computed) used
  at both call sites. Re-ran the same repro after the fix: no hydration
  error, all 5 nav icons render cleanly. tsc/eslint/next build all clean.
  Same latent toLocaleString() pattern exists in 15 other files
  repo-wide (grepped) but wasn't fixed here - out of scope for this
  bounded fix, since only /pm was reported broken and reproduced; worth
  a dedicated follow-up loop if the Boss wants it swept everywhere.
Previously: Loop 59 complete - dependency security audit. npm audit:
  zero vulnerabilities across all 640 dependencies. Bumped the two
  Supabase packages (ssr, supabase-js) to their latest patch releases -
  the most security-relevant deps (auth/data client). Left the three
  major-version-jump packages (typescript, eslint, @types/node) alone
  deliberately - unattended major bumps are a real risk, not a
  verification-loop task. tsc/eslint/build all clean after the bump. See
  LOOP_59_REPORT.md.
Previously: Loop 58 complete - refreshed the V1 completion snapshot
  against IMPLEMENTATION_PACK.md section 32's 25-item acceptance checklist
  (same kind of check Gate 9 gave the Boss), accounting for Loop 54's
  G1/G2/G3 fixes and Loop 56's RISK-32/RISK-33 findings. Result: 23/25
  items fully compliant; 2 items (#9 technical restoration/verification,
  #13 reopen/duplicate/false-complaint) share a root cause - a locked
  multi-party/joint-decision rule that's either unimplemented (RISK-33,
  complainant disagreement) or incompletely enforced (RISK-32, reopen
  authority) - both already flagged to the Boss, both awaiting a design
  decision, neither guessed at. Pure reporting loop, no code changes. See
  LOOP_58_REPORT.md.
Previously: Loop 57 complete - two follow-up sweeps from Loop 56's
  findings, pure verification, no code changes. (1) Swept
  IMPLEMENTATION_PACK.md for every multi-actor/joint-authority phrase to
  check whether RISK-32 (reopen) has siblings - found none; the one other
  candidate (section 20, Planned Maintenance Window, "Manager + Production
  Manager jointly decide") is confirmed entirely unbuilt but legitimately
  Phase-3 scope (needs a Production Manager actor that doesn't exist in
  this standalone module), not escalated as a defect. (2) Re-swept the app
  for pre-redesign Tailwind patterns to confirm Loop 50-53's visual
  redesign held - no regression found, all remaining bg-white/[0.0X]
  matches are the deliberate translucent-overlay convention. See
  LOOP_57_REPORT.md.
Previously: Loop 56 complete - golden-scenario (§32) / negative-test (§33)
  re-verification pass against the Boss's new Architecture Blueprint's own
  registry, cross-checked against the actual 216-test suite (Boss approved
  "Continue...Loop 56 to 60" without picking a specific candidate; this was
  candidate 1 from APPROVAL_REPORT_LOOP_51_55.md). Found a real CRITICAL
  gap: reopen_case only checks is_staff() - any single Executive OR Manager
  can reopen a CLOSED case alone, contradicting IMPLEMENTATION_PACK.md line
  150's LOCKED "Reopen authority = Executive + Manager" (confirmed in the
  pack itself, not just the new Blueprint). NOT fixed - the exact mechanism
  is a design decision, flagged for the Boss (RISK-32). Also found NS-020
  (complainant disagreement path) has zero implementation anywhere -
  flagged as RISK-33, also awaiting a Boss decision. Fixed 2 genuine test-
  coverage gaps that were already structurally guaranteed but untested
  (NS-007 temp-restoration non-closure, NS-019 audit_log update/delete
  denial), plus strengthened one existing assertion (NS-009). tsc/eslint
  clean. See LOOP_56_REPORT.md and RISK_REGISTER.md (RISK-32, RISK-33).
Previously: Loop 55 complete. **GATE 11 (Loops 51-55) — MANDATORY STOP,
  AWAITING BOSS** per §19.9/§19.13. PR #54 (Loops 51-54's combined work)
  merged to main. The Boss's requested "design complete" message was sent
  in chat. See APPROVAL_REPORT_LOOP_51_55.md.
Previously: Loop 54 complete - Boss uploaded a new Architecture Blueprint
  document and asked for a screen-by-screen/data/permission/harness gap
  matrix against the repo before any implementation. Read all 35 Blueprint
  sections, cross-checked against actual migration SQL/RPC bodies/RLS/forms
  (not memory), wrote BLUEPRINT_GAP_MATRIX.md. Backend is already
  comprehensive (26 tables, ~60 RPCs) - most sections MATCH. Flagged a
  version-number discrepancy (Blueprint cites v0.3, repo pack is v0.2
  LOCKED) without silently resolving it. Found 3 genuine gaps, all
  traceable to the CURRENT v0.2 pack itself: G1 (real bug - no UI path ever
  set status ASSESSED, so assign_technician's auto-advance to ASSIGNED
  never fired from a normal Acknowledge->Assign flow), G2 (intake form
  missing shift field), G3 (diagnosis form missing 2 of the LOCKED section
  9's 8 required fields - observed_symptom, immediate_action - no column
  existed). Put G1's fix shape and the priority-at-intake question to the
  Boss rather than guessing; Boss chose a dedicated Confirm Assessment
  screen for G1, and shift-only (no priority change) for G2. Implemented
  all three: new migration 0048 (2 nullable columns on interventions,
  additive only), new AssessmentForm reusing the existing transition_case
  RPC (zero new backend surface), shift field added to intake. tsc/eslint/
  build all clean; npm test blocked locally by RISK-05 as always, CI is the
  verification path. See BLUEPRINT_GAP_MATRIX.md and LOOP_54_REPORT.md.
Previously: Loop 53 complete - Sarvam-mandated 8-category forensic
  sweep on the Loop 51-52 restructure. Categories 1-6 (triggers/
  constraints, RPC guards, RLS/grants, client-side gating, duplicate-
  submit idempotency, error/rollback paths) confirmed clean by reasoning +
  grep; one honest non-blocking finding recorded (a sheet doesn't
  explicitly close on successful submit - abrupt unmount when its gating
  boolean flips false, pre-existing behaviour from before Loop 51, left
  for Boss to weigh). Category 7 (mobile responsive) got actual live-
  render confirmation this time: local-only never-committed proxy.ts
  bypass (reverted, confirmed via empty git status) + Playwright
  screenshots of a dummy-data preview route at mobile/desktop widths -
  confirmed sheet/tabs/sticky-bar render correctly, bottom-sheet vs
  centered-modal breakpoint switch works, Escape closes + returns focus
  to the trigger (measured, not assumed). Shipped no product code - this
  was a pure verification loop. See LOOP_53_REPORT.md.
Previously: Loop 52 complete - sticky mobile primary action (Sarvam
  DR-04) pulled out of Overview tab, reachable from any tab now; KPI page
  Group sections wrapped in a card shell. Sticky-bar positioning could not
  be live-verified (RISK-05) - flagged as elevated-risk, not claimed as
  done-and-confirmed. See LOOP_52_REPORT.md.
Previously: Loop 51 in progress (Boss: "loop 51 se loop 55 tak complete
  karo...mujhe design complete ka msg chahiye" - explicit continuation past
  Gate 10). Case Detail (cases/[id]/page.tsx) restructured from one
  550-line unconditional-scroll page into Sarvam's own proposed local-nav
  model: persistent header + 10 tabs (Overview/Journal/Interventions/
  Assignments/Spares/Restorations/QC/Waiting/Audit/Evidence). The 4 forms
  that previously rendered as a permanent inline coloured box (Acknowledge,
  Mark Duplicate, Close False Complaint, Hand Over - the ones with no
  existing collapse toggle, unlike Assign/Intervention/Waiting/Observation/
  Restoration which already had one) now open as a bottom sheet, matching
  Sarvam's DR-02 and the Boss's own already-shipped Quality-app disposition
  wizard. Every panel kept its exact existing props/logic/RPC - this loop
  relocated JSX, it did not rewrite any form's internals. New:
  components/sheet.tsx (ActionSheetTrigger) and components/tabs.tsx
  (CaseDetailTabs). One live boundary bug caught before shipping: the
  first sheet.tsx had 2 non-default exports in a "use client" file
  consumed by a server component - exactly the Loop 16 lesson, invisible
  to tsc/eslint/build by design, caught by deliberately checking the new
  files against that specific known failure mode and fixed to a single
  default export (matching app-nav.tsx's own convention). A repo-wide
  re-scan for the same shape came back clean. See LOOP_51_REPORT.md.
Previously: Loop 50 complete. **GATE 10 (Loops 46-50) — MANDATORY STOP,
  AWAITING BOSS** per §19.9/§19.13. See APPROVAL_REPORT_LOOP_46_50.md.
  Loop 50: Boss flagged the live app as looking like "a basic webpage" and
  supplied two reference apps (AOS, Quality) as the concrete bar for "top
  tier." Both read in full by dedicated research agents before any code
  changed. Key finding: AOS and Quality share the exact same design-token
  scheme (identical hex values, --r radius, Inter font) - this is the
  Boss's own established MONARCH design language, not something to invent.
  Maintenance was using generic Tailwind slate/indigo, disconnected from
  either sibling app - the concrete reason it read as "basic." Adopted the
  MONARCH tokens into globals.css (dark 5-level surface stack, Tailwind
  v4 @theme inline wiring, Inter now actually loaded via next/font -
  neither reference app loads the font it names), rewrote
  components/ui.tsx (gradient/glow buttons, layered-shadow cards, and a
  NEW canonical case-status colour map that replaces the three separate
  inconsistent maps flagged in Loop 49's Sarvam report - closes finding 1c,
  the hardcoded-blue Case Detail badge), restyled app-nav.tsx/layout.tsx
  chrome with backdrop-blur glass, and swept 41 files' worth of old-palette
  Tailwind classes onto the new tokens via a reviewed substitution (~700
  occurrences, word-boundary matched, verified against tsc/eslint/build
  after every pass). Caught and fixed two self-inflicted bugs before
  shipping: the sweep briefly corrupted a deliberate bg-white/[opacity]
  overlay into a nonsensical bg-card/[opacity], and a CSS comment
  containing the literal string "*/" broke the whole stylesheet parse -
  both found by actually reading the diff and running the dev server, not
  assumed clean because tsc passed. Live-screenshotted /login (desktop +
  mobile) via a local next dev + Playwright script and sent both to the
  Boss - the one route this sandbox can render without live Supabase data
  (RISK-05 still blocks the rest; CI verifies those). Does NOT restructure
  Case Detail into Sarvam's bottom-sheet model (still one long page - next
  stage, pending this gate) and does NOT touch the 2 remaining
  IMPLEMENTATION_PACK.md findings (intake shift/priority, diagnosis
  fields) - pure presentation-layer change, zero RPCs/migrations/RLS
  touched. See LOOP_50_REPORT.md.
Previously: Loop 49 complete. Boss supplied the full Sarvam Screen
  Architecture HTML and answered the remaining Type B questions (items
  1/2/3 LOTO/recurrence-threshold/permission-matrix stay PENDING per
  Boss's own instruction; item 4 stale test data - delete if harmless;
  item 5 leaked-password - still last; item 6 the 103 duplicate-blocked
  cases - delete if harmless; item 7 GitHub repo stays public). Two
  pieces of work this loop, both docs/data only, zero code changed:
  (a) DB_CLEANUP_FOLLOWUP_REPORT.md - deleted the 103 DUPLICATE-blocked
  cases + their 103 primaries (206 total, all provably synthetic, zero
  orphans) plus 114 remaining historical-backlog synthetic cases plus 8
  more leaked test artifacts using an OLDER tag convention my first pass
  miscounted as non-synthetic ([AUTOTEST-L27]/[AUTOTEST-R25] from Loop 27
  and a RISK-25 test - the guarded function's own pattern correctly
  caught them, my manual pre-check pattern was too narrow, caught and
  corrected before reporting). Database now has ZERO cases/pm_plans/
  recurrence_rules - a genuinely clean slate, only the 2 demo staff + 4
  auth identities remain. (b) SARVAM_VERIFICATION_REPORT.md - the
  promised forensic mismatch pass against the full HTML. Flagged (not
  fixed) three real findings, checked against IMPLEMENTATION_PACK.md
  directly rather than Sarvam's restatement of it: intake form missing
  shift/priority fields Pack section5.1 explicitly requires (traced to a
  security-lockdown migration from Loop 27/RISK-19 that codified an
  already-missing field rather than deciding to omit it); 2 of the 8
  section9 diagnosis concepts (observed_symptom, immediate_action) have
  no distinct capture point; Case Detail's status badge is hardcoded
  blue regardless of actual state (a real usability bug, found
  independently, not a Sarvam citation). Everything else in the Sarvam
  file (DR-01..05) is explicitly PROPOSED/non-binding per the handoff and
  reported as a visual/organizational difference only, not a defect. Also
  flagged a version-number discrepancy inside Sarvam's own source-note
  (cites both v0.2 and v0.3) rather than silently resolving it. See both
  reports for full evidence.
Gate 9 APPROVED, SCOPED to Type A. A Boss-directed
  surgical task then closed RISK-25 and cleaned the synthetic test data —
  see CLEANUP_AND_RISK25_REPORT.md. RISK-25 RESOLVED: three enforced
  INTERNAL waiting reasons (reporting-manager approval pending / PO release
  pending / Other with mandatory detail), enforced at UI + RPC + a DB CHECK
  constraint, and INTERNAL waits now join the EXISTING 24h escalation
  measured from entered_at. Escalation notifies but never resolves.
  CLEANUP: 8,920 synthetic cases removed safely; 321 remain (114 open, 207
  non-open deliberately untouched). Zero orphans. 114 open rather than 10
  because 103 are blocked by a DUPLICATE case pointing at them and deleting
  resolved cases is forbidden — safety outranks the number. Test runs now
  clean up their own data. Loop 41 then checked that refill claim against
  the next real CI run and found it did NOT hold: Playwright had no
  teardown at all (4 leaked cases per run), and the cleanup could delete a
  CONCURRENTLY-RUNNING workflow's in-flight cases because it selected on a
  time window with no notion of run ownership. Both fixed — every synthetic
  case now carries a [run=<tag>] marker and a run deletes only its own. The
  first version of that fix was itself wrong (it matched the tag with LIKE,
  where '_' is a wildcard, so 'RUN___' matched 'RUNBBB') and was caught by
  its own red-team test. See LOOP_41_REPORT.md.
  Loop 42 then asked what the cleanup never LOOKS at, and found two more:
  pm_plans (484 rows, 484 synthetic) and recurrence_rules (183/183) hang
  off no case, so the case-walker never saw them - and 182 of those plans
  are RECURRING/approved with 14-30 day frequencies, so once they mature
  the hourly PM scan will fire hundreds of PM_OVERDUE alerts at a REAL
  manager for maintenance that does not exist. Second: 4,175 of 5,659
  audit rows (74%) dangle, because the cleanup removed audit rows only for
  target_table='maintenance.cases'. THIS CORRECTS LOOP 40's "zero orphans"
  claim - that probe covered the eleven FK-linked dependents, and
  audit_log deliberately has no FK, so the one table that could dangle was
  the one not checked. Mechanism built and proven; the historical backlog
  is NOT yet deleted and waits on the Boss. See LOOP_42_REPORT.md.
  Loop 43 returned to authorization and found the WORST defect in this
  project so far - RISK-28, CRITICAL. maintenance.status_transitions IS
  the SS4 LOCKED lifecycle graph that every transition check validates
  against, and migration 0003 created it without ever enabling RLS. With
  Supabase's default schema grants, an UNAUTHENTICATED caller could insert
  a REPORTED->CLOSED edge (closing any case with no diagnosis, no repair,
  no QC clearance - and transition_case would have accepted it as
  legitimate) or delete the whole graph (total denial of service on the
  lifecycle). Both proven live as the anon role with no JWT, reverted
  immediately, and the graph verified back to exactly its canonical 26
  edges set-wise. Fixed in 0043: RLS on, SELECT-only for authenticated, no
  write policy for anyone including staff, write grants revoked. Verified
  the lockdown did not break the SECURITY DEFINER path - a legal
  transition still succeeds, an illegal one still raises
  INVALID_TRANSITION. 5 tests including a canary on the edge count. See
  LOOP_43_REPORT.md.
  Loop 44 then asked WHY that one missed RLS was fatal, and found the
  default behind it (RISK-29): pg_default_acl grants every NEW object in
  this schema to anon automatically - tables get full DML, functions get
  EXECUTE, sequences get rwU. So RLS was the only thing standing between
  an unauthenticated caller and every table, and any future table would
  carry the same loaded default. Three live leaks proven as anon with no
  JWT: the manager roster via case_notification_recipients, an
  is-this-an-emergency oracle, and next_case_number burning MC numbers
  (two were burned proving it - that gap is real and recorded). Fixed in
  0044 by revoking the schema DEFAULT PRIVILEGES for anon plus all
  existing grants and schema USAGE. authenticated deliberately untouched:
  can_read_case, case_is_confirmed_emergency and next_case_number are
  evaluated as the CALLING user in policies and a column default, checked
  against pg_policy first. Two sweeps found nothing and are recorded as
  such - every function already pins search_path, and no
  INVOKER/DEFINER mismatch exists. See LOOP_44_REPORT.md.
  Boss-side items: QC identities ANSWERED (they will come from the Quality
  module at integration; qc_authority staying empty is now a decision, not
  a gap). Leaked-password protection deferred by the Boss to last. Two new
  questions: whether to also remove the 103 duplicate-primary cases, and
  the Sarvam Screen Architecture document needed to action the UX sections.
Current gate: **GATE 9 (Loops 41-45) APPROVED, SCOPED.** The Boss was
  shown a percent-complete breakdown against SS32's 25-item checklist, split
  into Type A (Claude-executable technical debt) and Type B (needs Boss
  evidence/decisions). Reply: "Type A start karo". Loop 46+ proceeds on
  triggers/constraints sweep, Vercel/Sentry config audit, and the SS30
  mobile-first UX pass. Type B (shared test/prod DB, leaked-password
  protection, 103 duplicate-primary cases, Sarvam doc, PENDING-01..04) is
  NOT reopened by this reply and stays AWAITING BOSS. Six defects this batch, two
  of them the most serious in this project so far (RISK-28 CRITICAL, RISK-29
  HIGH), and three of them in work reported as complete in the previous
  batch. Loop 45 added RISK-30: evidence could be attached to ANY case by
  ANY signed-in user, including one who could not read that case - proven
  live, then fixed by making INSERT scope match SELECT scope via
  can_read_case(). Both deletions are now DONE (Boss approved
  conditional on no harm): 8 e2e cases -> 0, pm_plans 489 -> 0,
  recurrence_rules 183 -> 0, audit_log 5,753 -> 520 with ZERO dangling left,
  and PM_OVERDUE generators 183 -> 0 so the alert time-bomb is defused. Zero
  non-synthetic rows deleted; staff, auth.users and the 26-edge lifecycle
  graph untouched; zero orphans across eight probes; the 24h window guard
  NOT weakened (one-time migration 0046, no new callable function left
  behind). See BACKLOG_CLEANUP_REPORT.md and APPROVAL_REPORT_LOOP_41_45.md.
  Loop 46 (first Type-A loop, Boss said "Type A start karo") swept every
  trigger (1, correctly scoped) and every CHECK constraint (24) in the
  schema. RISK-31: spare_requests.initiated_role collapsed
  MAINTENANCE_MANAGER into 'EXECUTIVE' because is_staff() is true for both
  locked roles - proven live (a Manager's own spare request displayed as
  "Requested by executive"). Not a security defect (approval routing uses
  estimated_amount vs the ₹12,000 boundary, independent of this field) but
  a real §16.3/§29 audit-trail accuracy bug. Fixed by deriving the label
  from current_staff_role() (already existed, never used here); the TS
  union type was also missing "MANAGER" and was corrected. See
  LOOP_46_REPORT.md.
  Loop 47 swept the deployed runtime config for the first time (Vercel +
  Sentry) - no prior loop had. Vercel: deployment protection is off,
  judged safe because the app's boundary is Supabase auth + RLS, not
  network access control; the GitHub repo is public (reported for the
  Boss, not changed); env vars are exactly the two correctly-public
  Supabase values, no secret anywhere in src/. Sentry: 2 "unresolved"
  issues, both confirmed stale (127.0.0.1:3100, a GitHub Actions runner,
  0 users impacted) - the Loop 16 use-client boundary defect, fixed
  same-day two days earlier and absent from the source tree since. Both
  resolved in Sentry with the root-cause chain recorded. No code change
  this loop. See LOOP_47_REPORT.md.
  Loop 48 (mobile-first UX pass, §30/§32 item 21) received the Sarvam Type-A
  handoff mid-loop and treated it strictly as non-binding guidance per the
  Boss's instruction - DR-01..05 stay PROPOSED, not implemented as new
  business rules. Corrected an earlier overstatement: "4/36 components use
  responsive classes" measured the wrong thing, since Tailwind v4 is
  mobile-first and unprefixed classes already apply everywhere - rechecked
  actual structure and found cases queue already cards, bottom tab nav
  already exists, /cases/new and PM/recurrence-rules pages already
  single-column, the one <table> in the app already wrapped in
  overflow-x-auto. No structural mobile defect found. The one real gap:
  the shared Button "md" size (the default, used for every primary
  Save/Acknowledge/Submit action app-wide) was under the ~48px minimum
  touch target §30 and the handoff's §C both ask for - fixed with one
  min-h-12 line in the shared component, "sm" deliberately left compact
  for its 26 secondary/inline call sites. New test
  (button-touch-target.test.ts, 3/3 passing) guards both the fix and the
  deliberate sm exception. Type-A forensic sweep (all 8 handoff categories)
  run explicitly - no follow-on defect. Not claimed as Sarvam compliance;
  that verification waits for the Boss's promised full HTML. See
  LOOP_48_REPORT.md.

Items that need the Boss and are NOT loop work — none has been guessed at:
  1. QC identities — ANSWERED. The QC login name comes from the Quality
     module at integration; maintenance.qc_authority staying empty is now
     a recorded decision, not a gap.
  2. Separate test and production databases, or accept the shared project.
     STILL OPEN — mitigated by run tagging and a scoped teardown, not removed.
  3. Enable leaked-password protection (Supabase dashboard → Auth).
     DEFERRED by the Boss to last.
  4. RISK-25 — CLOSED. The Boss supplied the three INTERNAL reasons and the
     escalation rule; implemented and live-verified.
  5. Whether to also remove the 103 open cases that a DUPLICATE case points
     at. Doing so means deleting the linked resolved cases, which §16
     forbids without an explicit instruction.
  6. The Sarvam Maintenance Screen Architecture document, needed to action
     the UX sections (§4/§5/§27). Never supplied; that work is recorded as
     NOT TOUCHED, not as done.

Open defects: none known unresolved. RISK-08/09 (Loop 2), RISK-10/11/12
  (post-Loop-5 bugfix round triggered by a Boss-reported login failure),
  RISK-13 (Loop 8 — `is_manager()` NULL-propagation authorization bypass),
  RISK-14 (Loop 9 — a rewrite of `transition_case` silently dropped the
  locked boundary, same shape as the Loop 8 spares fix), and RISK-18
  (Loop 26 — `case_assignments_insert`'s `emergency_direct_start` path
  never checked the target case was an actual confirmed emergency; a
  non-staff technician could self-grant intervention/spare-usage rights
  on ANY case), and RISK-19 (Loop 27 — `cases_insert` validated only
  `reporter_user_id`; any signed-in non-staff user could self-insert a
  case with `emergency_confirmed = true` or a fully-fabricated
  `status = 'CLOSED'`, bypassing the entire §4 LOCKED lifecycle graph and
  §6 two-step emergency gate at the root, with zero RPC/audit-trail
  involvement — CRITICAL, the highest-severity defect found in this
  project to date, strictly worse than RISK-18), and RISK-20 (Loop 28 —
  the 0025 fix for RISK-18 still left `assigned_by_user_id` client-writable
  on the `case_assignments` direct self-insert path; a self-service
  technician could forge it to a real staff member's id, falsely claiming
  staff mediation that never happened — MEDIUM, an audit-trail integrity
  gap rather than a lifecycle/authority bypass), and RISK-21 (Loop 29 —
  `record_spare_usage`'s `>₹12,000` Manager-approval gate (§3.3, named
  LOCKED in `CLAUDE.md`) was entirely conditional on a client-optional
  `p_spare_request_id` parameter; omitting it skipped the gate completely
  and also left the usage row untraceable to any named spare at all,
  violating §16.1's "mandatory V1" chain — HIGH, and the first finding
  this batch reachable through the shipped UI's own default dropdown
  selection, not only a direct API call), and RISK-22 (Loop 30 —
  `record_intervention`'s actor check never verified an actual
  `case_assignments` row existed, only comparing a client-supplied id to
  the caller's own; any signed-in non-staff user, with zero assignment to
  a case, could fabricate an intervention record on it — HIGH,
  live-exploitable audit-trail forgery; this app's own UI already gated
  the form correctly, so this was a pure server-side enforcement gap)
  all RESOLVED and verified against the live deployment. Loop 35's
  finding (`raise_safety_stop` never sent the §15-mandatory notification)
  was a missing-notification completeness gap, not a security/authority
  bypass — not logged as a new RISK entry, matching the Loop 22/Loop 34
  precedent for non-security completeness fixes. No CRITICAL or HIGH
  defects currently open.
Highest severity open: none.

Vercel status: LINKED and GREEN. Team `Monarch` (monarch-92be), project
  `monarch-maintenance-module`. SSO/deployment protection is OFF (fixed
  Loop 2). App-level Supabase auth is the actual access boundary. `main`
  is the configured production branch; PRs #1-#5 (Loops 1-5, 6, 7, 8, 9)
  are all merged.
Sentry status: LINKED, SDK wired, verified live (Loop 2). Org `monarch-bo`,
  project `monarch-maintenance-module`.
Test status: Vitest integration suite wired into CI (`npm test` in
  `.github/workflows/ci.yml`), run as real signed-in users against the live
  `maintenance` schema. 17 tests from Loop 6, +10 Loop 7 (§6 claim/confirm,
  notifications), +7 Loop 8 (§16 spares, `is_manager()` regression), +4
  Loop 9 (§4.6/§4.7), +6 Loop 10 (§17 PM), +6 Loop 12 (§22 handover),
  +7 Loop 13 (§13 production boundary), +8 Loop 14 (§25 impact/KPI),
  +9 Loop 15 (§18 recurrence, §19 CAPA), +10 Loop 16 (§5.4 priority override,
  §14.2 PTW gate), +6 Loop 17 (§9.1 validated root cause), +4 Loop 18
  (§5.1 evidence attachment), +2 Loop 19 (§5.1/§24 major/complex intake),
  +4 Loop 20 (§5.1 asset linkage), +1 Loop 22 (§10 restoration follow-up
  flag), +3 Loop 23 (§18 `set_recurrence_rule_active`, previously
  zero coverage), +5 Loop 24 (§16.2 Stores reference RPCs, previously
  zero coverage), +9 Loop 25 (`observations`/`clearances`/`audit_log` RLS,
  new file, previously zero coverage), +3 Loop 26 (`case_assignments`
  `emergency_direct_start`, RISK-18, previously zero coverage), +4 Loop 27
  (`cases_insert` column lockdown, RISK-19, previously zero coverage on
  columns beyond `reporter_user_id`), +1 Loop 28 (`case_assignments`
  attribution lockdown, RISK-20), +1 Loop 29 (`record_spare_usage`
  requires a linked request, RISK-21; 2 pre-existing tests also updated,
  see CHANGELOG), +2 Loop 30 (`record_intervention` requires an active
  assignment, RISK-22), +1 Loop 34 (§8 observation journal, all 9
  canonical fields including intervention linkage), +2 Loop 35
  (`raise_safety_stop` §15 manager notification, previously zero
  coverage of any notification behavior on this RPC) —
  **129 tests across 17 files** (counted from `it()` blocks), all confirmed
  passing in real GitHub Actions CI (including catching and driving the
  RISK-14 fix).
  (Correction: the Loop 10 gate report said "44 tests across 7 files"; the
  real figure at that point was 40. Counted from `it()` blocks — see
  CHANGELOG Loop 12.)
  Browser E2E: NEW in Loop 11 — 8 Playwright tests (`e2e/*.spec.ts`) wired
  into CI as their own `e2e` job. First CI run: 6/8 passed, including all
  four sign-in flows; the 2 failures were wrong assertions in the test code
  itself, since fixed. 2 specs (signed-out) also pass in this sandbox — the
  first browser tests ever to run here. See RISK_REGISTER.md RISK-05.

CI note (Loop 14): `signInAs()` now caches one signed-in client per role.
  Signing in per test had grown to ~78 GoTrue `/token` requests in ~80s from
  one CI IP and was tripping Supabase's auth rate limit — red CI that was
  infrastructure, not product (RISK-16). CI also now runs on `push` to
  `main` plus `pull_request` only, with a `concurrency` group, so a PR
  commit no longer starts two workflows racing on the same live project.

Pending evidence gates: PENDING-01 (LOTO/PTW SOP — untouched, only seam
  columns exist), PENDING-02 (moot — Production module still has no live
  schema), PENDING-03 (granular permission matrix beyond the 2 locked
  roles), PENDING-04 (recurrence threshold/window — recurrence, §18, still
  entirely unbuilt), PENDING-05 (none discovered).

Batch summary (Loops 11-15 — see CHANGELOG.md for full per-loop detail):
  - Loop 11: browser E2E (Playwright) wired into CI as its own job —
    closed RISK-05, open since Loop 1. 8/8 green.
  - Loop 12: §22 shift handover / availability.
  - Loop 13: §13 production restart boundary (safety stops, §13.1/§13.2
    recording that never silently clears a stop).
  - Loop 14: §25 KPI reporting + production impact capture — the one real
    §25 gap was that "downtime minutes" and "output loss kg" had nowhere to
    live. Added `case_impact_records` (nullable measures, mandatory basis,
    append-only corrections via `supersedes_record_id`),
    `record_production_impact`, the `case_current_impact` view, an impact
    panel on the case page, and a new `/kpi` page. RISK-15 (view bypassed
    RLS) and RISK-16 (CI auth rate limit) both found and fixed in this loop.
  - Loop 15: §18 recurrence detection + §19 CAPA. The threshold and window
    are PENDING-04, so `recurrence_rules` ships EMPTY and the scan flags
    nothing until a Manager configures a tier — detection is dormant by
    construction, and a test asserts no active rule exists. The scan writes
    SUSPECTED only; no code path declares root cause without a human. CAPA
    owner and effectiveness verifier are both the Manager, and a
    system-proposed CAPA is labelled "suggested — not certified" (§19).

Batch summary (Loops 6-10 — see CHANGELOG.md for full per-loop detail):
  - Loop 6: Vitest integration suite wired into CI.
  - Loop 7: §6 emergency two-step (`claim_emergency`/`confirm_emergency`),
    §23 notifications (`maintenance.notifications` + RLS +
    `mark_notification_read`), §7.2/§7.3 timer escalation
    (`run_escalation_scan`, pg_cron every 5 min).
  - Loop 8: §16 spare request/usage RPCs, §3.3 ₹12,000 Manager-approval
    threshold computed server-side. RISK-13 found and fixed
    (`is_manager()` NULL propagation).
  - Loop 9: §4.6 duplicate case linkage (`mark_duplicate_case`), §4.7
    reporter-driven false/wrong complaint closure
    (`close_false_complaint`).
  - Loop 10: §17 preventive maintenance — `create_pm_plan`/
    `approve_pm_plan` (RECURRING proposed-by-staff/approved-by-Manager vs.
    ONE_TIME Manager-only/self-approved), `link_pm_instance_to_case`/
    `complete_pm_instance`/`reschedule_pm_instance` (history-preserving),
    `run_pm_scan` (pg_cron hourly) for generation + `PM_OVERDUE` alerts.
  - **RISK-14** (between Loop 9 and 10): Loop 9's `transition_case`
    rewrite was built from a stale copy of the function and silently
    dropped the Loop 5 QC gate. Caught by CI on PR #5, not by manual
    review — reproduced live, fixed at the source
    (`0012_maintenance_qc_gate_regression_fix.sql`), re-verified, and the
    process gap that caused it (a live-only fix with no matching migration
    file) is now called out explicitly in CHANGELOG.md as a standing
    process rule for this repo.

Migrations applied: 0008 (Loop 7) through 0029 (Loop 30), all live on
  Supabase project `maavrlqkdrisjwzhjdgg` and verified via `execute_sql`
  before each was pushed. 0019 (Loop 16) touches `transition_case` for the
  third time (adding the §14.2 PTW gate), built from the LIVE function
  definition per the standing RISK-14 process rule, with a full regression
  of every pre-existing guard re-verified live immediately after applying.
  0020 (Loop 17) adds the second view in this schema, `case_current_root_cause`
  — created WITH `security_invoker = true` from its first line (verified via
  `pg_class.reloptions` right after creation), applying the RISK-15 lesson
  prospectively rather than needing a second fix. Loop 18 adds NO migration —
  `maintenance.evidence` and its RLS have existed since Loops 1/2 and were
  simply never used until now. 0022 (Loop 22) edits `record_restoration`,
  also built from the LIVE definition per RISK-14 — only the
  `follow_up_required` value is new, the rest byte-identical to what was live.

PR #12 (Loop 16) needed two post-open CI fixes before it merged: a test-helper
  logic bug, and a genuine Next.js server/client boundary bug (a plain helper
  function exported from a `"use client"` file, called directly from the
  Server Component) — invisible to `tsc`/`lint`/`build`, only surfacing on an
  actual authenticated page render, which only CI's e2e job could exercise
  (this sandbox has no live Supabase access, RISK-05). Both fixed and
  verified live in CI; every `"use client"` file in the app has since been
  re-scanned after each subsequent loop for the same pattern (none found).

Batch summary (Loops 16-20 — see CHANGELOG.md for full per-loop detail):
  - Loop 16: §5.4 priority Manager-override (`change_priority`, an Executive
    may change freely until a Manager sets it, after which only a Manager
    can move it further) + §14.2 PTW safety gate seam (`set_ptw_required`/
    `link_ptw_proof`, gating `DIAGNOSING -> IN_REPAIR` when required and
    unproven) — closing two real gaps in §32 items 3 and 19 that had been
    sitting as dead columns/no-override logic since Loop 1.
  - Loop 17: §9 item 6 / §9.1 validated root cause. `record_root_cause`
    (staff-only, mandatory validation basis, append-only corrections via
    `supersedes_record_id`) closes the last of §9's 8 diagnosis/intervention
    concepts that had no seam — previously root cause could only be recorded
    against a CONFIRMED recurrence flag, leaving ordinary one-off cases with
    nowhere to record one at all.
  - Loop 18: §5.1 / §26 evidence attachment. No new migration —
    `maintenance.evidence` has existed since Loop 1 with correct RLS since
    Loop 2 (any authenticated user may attach evidence to a case they can
    see, not staff-only, matching how case reporting itself works) but
    nothing had ever written to it or displayed it. A test-writing mistake
    was caught before shipping: RLS-blocked UPDATE/DELETE via PostgREST
    reports success with zero rows affected, not an error — the test now
    asserts the row is provably unchanged instead.
  - Loop 19: §5.1 / §24 major/complex classification at intake. No new
    migration or RPC — `cases.major_complex_flag` and its RLS have existed
    since Loop 1 (the reporter's own insert policy already permits setting
    it); this loop is intake-form UI plus list/detail badges. Deliberately
    no later change/override flow — the pack documents the classification
    happening at creation, not a revision mechanism for it.
  - Loop 20: §5.1 asset/machine linkage. No new RPC — `case_assets` and its
    RLS have existed since Loop 1/2 (staff-only, same shape as evidence)
    but nothing had ever written to it. Adds one trigger
    (`case_assets_mark_known`, `SECURITY DEFINER` — confirmed live first
    that `cases` has no direct UPDATE policy at all, so a plain trigger
    would have failed) keeping `cases.asset_known` honest once a real link
    is made. Also the knock-on fix: §18's recurrence `ASSET_REF` match tier
    (Loop 15) could never produce a match before this loop — verified live
    that it now does (3 cases sharing one linked asset -> 1 flag).

Approval state: Gate 5 approved. Loops 26-30 in progress.

Batch summary (Loops 21-25 — see CHANGELOG.md for full per-loop detail):
  - Loop 21: dashboard/KPI visual upgrade. Boss-scoped explicitly to
    presentation only (no new modules/nav — a real scope boundary was
    confirmed via AskUserQuestion after several unrelated third-party CMMS
    screenshots were shown for visual reference). No migration, no RPC.
    New shared `StatCard`/`BarBreakdown` components (plain server-safe
    module, no `"use client"`). While touching `/kpi`, found and fixed a
    real stale-copy defect: the page said §18 recurrence/§19 CAPA were
    "not implemented yet" — false since Loop 15 — and never queried either
    table. Now shows real counts (verified live: 2 recurrence flags, 15
    CAPA links already existed and were invisible before this loop).
  - Loop 22: §10 permanent-repair follow-up responsibility.
    `restorations.follow_up_required` has existed since Loop 1 but
    `record_restoration` never set it. The rest of §10 was already
    correctly built (Loop 5's RISK-12 transition-graph guard + the
    existing `FollowUpButton` UI) — the real gap was narrower: once a case
    moved past `TEMPORARILY_RESTORED`, the fact it ever needed a stop-gap
    fix became unrecoverable from the schema. Migration 0022 sets
    `follow_up_required = (restoration_type = 'TEMPORARY')` on insert,
    built from the LIVE `record_restoration` definition per the standing
    RISK-14 rule. New `restoration-history-panel.tsx` on the case page
    (nothing showed TEMPORARY restorations before this loop) and a new
    `/kpi` metric. Investigated `evidence_ref` (also zero references
    anywhere) and deliberately left it alone — Loop 18's general evidence
    table already covers "preserve evidence" for restorations; a second,
    parallel free-text pointer would be redundant, not a fix.
  - Loop 23: §18 recurrence-rule configuration UI. `create_recurrence_rule`
    and `set_recurrence_rule_active` (Loop 15) were fully correct and
    fully unreachable from this app — the only caller had ever been direct
    SQL, by me, for testing. New `/recurrence-rules` page (staff-read,
    Manager-act, matching each RPC's own guard) does not resolve
    PENDING-04 — no field defaults a threshold/window, and
    `approval_note` stays mandatory. Closed a real automated-test gap
    found along the way: `set_recurrence_rule_active` had zero coverage
    before this loop.
  - Loop 24: §16.2 explicit Stores reference identifiers.
    `stores_reference_status`/`stores_reference_id` on `spare_requests`
    and `spare_usage` have existed since Loop 1 (default
    `STORES_REFERENCE_PENDING`/`null`) but no RPC could ever change them.
    New RPCs `set_spare_request_stores_reference`/
    `set_spare_usage_stores_reference` (staff-only, mandatory status —
    deliberately unconstrained text, matching the column's own lack of a
    `check` constraint since the real vocabulary is Stores' own once
    Phase-3 integration exists). `spares-panel.tsx` now shows and lets
    staff update the Stores status/reference per row.
  - Loop 25 (last of the batch): systematic RLS-coverage sweep — every
    RLS-enabled table cross-referenced against every test file for zero
    coverage. `observations`/`clearances`/`audit_log` came back.
    Live-verifying `clearances` before writing its test found RISK-17 (see
    RISK_REGISTER.md): `clearances_insert` let any staff member insert a
    row directly for any case in any status, bypassing `send_to_qc`'s
    `TECHNICALLY_RESTORED` guard entirely. Fixed via migration 0024
    (RPC-only, matching the Loop 8 spares precedent). New
    `tests/observations-clearances-audit.test.ts` (9 tests) closes all
    three tables' coverage gaps.

Batch summary (Loops 26-30, complete — see CHANGELOG.md for full detail):
  - Loop 26: RISK-18 — a live-exploitable authority bypass on
    `case_assignments`. Widened Loop 25's RLS audit to read every policy's
    live `qual`/`with_check` against its own migration's comment.
    `case_assignments_insert`'s `emergency_direct_start` path never
    checked the target case was an actual confirmed emergency — a
    non-staff technician could self-insert an active assignment row on
    ANY case, self-granting `canRecordIntervention`/`canRecordSpareUsage`
    (page.tsx's `isAssignedTechnician` check) with zero emergency
    requirement and zero staff mediation. Verified genuinely exploitable
    live, not theoretical. Migration 0025 adds an `emergency_confirmed`
    check; re-verified all three directions (exploit blocked, legitimate
    path preserved, staff-mediated `assign_technician` unaffected).
  - Loop 27: RISK-19 — CRITICAL, the most severe defect found in this
    project to date. `cases_insert` (the schema's single most
    consequential insert policy) validated only `reporter_user_id`,
    leaving every other column on `cases` — `status`, all `emergency_*`
    columns, `qc_required`, `current_owner_user_id`, `closed_at`,
    `closure_reason` — fully client-writable at INSERT time. Live-verified
    as a non-staff user: self-inserted a case with `emergency_confirmed =
    true` (no claim/confirm ceremony), and separately self-inserted a
    fully-fabricated `status = 'CLOSED'` case, bypassing the entire §4
    LOCKED lifecycle graph and §6 two-step gate at the root, with no RPC
    and no audit trail — and independently un-did Loop 26's RISK-18 fix
    (fake the emergency first, then walk the now-"legitimate"
    `emergency_direct_start` path). Migration 0026 rewrites `cases_insert`
    as an allow-list matching exactly the real intake form's fields;
    every other column forced to `is null`/`= false`/`= 'REPORTED'`.
    Re-verified: both exploits now fail (`42501`), the real intake payload
    still succeeds at safe defaults, and every lifecycle RPC is confirmed
    `SECURITY DEFINER` (bypasses RLS, unaffected).
  - Loop 28: RISK-20 — MEDIUM, an audit-trail integrity gap on
    `case_assignments`. The 0025/RISK-18 fix checked `emergency_confirmed`
    but still left `assigned_by_user_id`/`is_active`/`deactivated_at`
    client-writable on the direct self-insert path. Live-verified: a
    self-service technician could forge `assigned_by_user_id` to a real
    staff member's id on a genuinely confirmed emergency, producing a row
    that looks staff-mediated but isn't — defeating the whole point of the
    `emergency_direct_start` carve-out (that no staff mediated it).
    Migration 0027 forces `assigned_by_user_id is null`/`is_active =
    true`/`deactivated_at is null` — the only honest state a fresh
    self-service row can start in. Re-verified: forgery now fails
    (`42501`), legitimate self-insert unaffected, `assign_technician`
    (SECURITY DEFINER) unaffected.
  - Loop 29: RISK-21 — HIGH. Switched angle: read every `SECURITY
    DEFINER` RPC's guards against its own documented intent instead of
    RLS policies. `record_spare_usage`'s `>₹12,000` approval gate (§3.3,
    named LOCKED in CLAUDE.md) ran only `if p_spare_request_id is not
    null` — omitting that optional parameter skipped the gate entirely,
    and (since `spare_usage` has no `spare_name` of its own) also left
    the row untraceable to any named spare, violating §16.1's mandatory
    traceability chain. Reachable via the shipped UI's own default
    dropdown option ("(not linked to a request)"), not just a direct API
    call — the first such finding this batch. Migration 0028 makes
    `record_spare_usage` require `p_spare_request_id`; `spares-panel.tsx`
    updated to remove the unsafe default and guide raising a request
    first. Re-verified: omitted-link call now fails
    (`SPARE_REQUEST_REQUIRED`); linked low-value usage still succeeds;
    linked unapproved high-value usage still correctly blocks
    (`APPROVAL_REQUIRED`, unchanged).
  - Loop 30: RISK-22 — HIGH, last loop of the batch. Continued the RPC
    audit across the remaining ~40 `SECURITY DEFINER` functions; most
    held up. `record_intervention`'s actor check (Loop 3) was
    `is_staff() OR p_technician_user_id = v_actor` — never verified an
    actual `case_assignments` row existed, unlike `record_spare_usage`'s
    own migration comment, which already described `record_intervention`'s
    intent as "staff, or the actively assigned technician" — never
    actually implemented. Compounded by a NULL-propagation bug: omitting
    `p_technician_user_id` (its default) made the check evaluate `NULL`,
    which PL/pgSQL's `if` treats as false, silently skipping it too.
    Live-verified: an unassigned non-staff technician could fabricate an
    intervention on any case, both by self-attributing and by omitting
    the parameter. This app's UI already gated the form correctly — pure
    server-side gap. Migration 0029 requires an active assignment
    (matching `record_spare_usage`'s pattern) plus a separate check
    blocking impersonation of a different technician. Re-verified live in
    all four directions (both exploit variants blocked; genuine
    self-recording and staff-mediated recording unaffected).

Batch summary (Loops 31-35, current batch — see CHANGELOG.md for full detail):
  - Loop 31: two verification pieces, no code change. (1) Finished the
    `SECURITY DEFINER` RPC-guard audit — read the ~25 remaining functions
    not yet checked in Loops 26-30; none showed the RISK-21/RISK-22 shape
    or any other guard mismatch. The sweep is now exhausted across the
    whole schema (~55 functions, Loops 29-31). (2) Spot-checked (per the
    Loops 26-30 gate report §H.2) whether RISK-19/RISK-18 ever affected
    real data before their fixes: three read-only queries for
    fabricated-CLOSED cases, fabricated-emergency-confirmed cases, and
    RISK-18-shaped `case_assignments` rows. Every row found was this
    project's own `[AUTOTEST-Lxx]` verification data from Loops 26-27
    (`MC-003975`, `MC-003973`, `MC-003770`) — no real Boss/staff data was
    ever affected.
  - Loop 32: new angle — read every RLS SELECT policy for over-broad
    read-side exposure (prior loops 26-31 only audited write/authority
    paths). Found 4 tables with `using (true)` (open to any authenticated
    user, not staff-scoped): `cases`, `evidence`, `safety_stops`,
    `production_boundary_events`. `cases_select`'s own migration comment
    says "All staff can see all open work" but the actual policy is
    broader than staff-only. `evidence` already reviewed/accepted in
    Loop 18. Deliberately NOT fixed — narrowing read access would mean
    guessing at PENDING-03's still-unresolved permission matrix
    (RISK-04) rather than receiving it from the Boss. RISK-04's entry
    updated with these 4 concrete table names instead, so it's
    actionable when the Boss provides guidance.
  - Loop 33: cross-referenced 3 pack sections not yet closely read
    against implementation (§24 Automation vs Human Decision, §28
    Idempotency/Concurrency, §37 Test Matrix), same method as Loop 24.
    Checked trigger functions first — only 1 exists in the whole schema,
    already reviewed. All three sections came back clean: §24's
    security-relevant AUTO/NEVER-AUTOMATE items match actual code (e.g.
    `TEMPORARILY_RESTORED` has no lifecycle-graph edge to `CLOSED`,
    confirmed live); §28's every listed concurrency-sensitive operation
    uses `for update` or an atomic `update...where` guard; §37's
    "concurrent accept race" is tested, and the one uncovered item (no
    receiver on handover) is an already-disclosed, deliberate
    manual-verification-only gap from Loop 12, not a new finding. No
    code change this loop.
  - Loop 34: continued the pack cross-reference into §8 (Observation +
    Action Continuity Journal, "mandatory V1 feature") and found a real
    gap: `observation-form.tsx` only ever exposed 4 of the 9 fields §8's
    canonical structure requires per entry (`observation`, `action`,
    `current_condition`, `next_step`) — `result`, `pending_action`,
    `blocker`, `intervention_id`, and `evidence_ref` have existed as
    columns since Loop 1 but were silently unreachable through the app;
    every journal entry ever created via the UI has those five columns
    permanently NULL. Not an RLS gap (confirmed live: `observations_insert`
    never restricted which columns could be set) — a pure UI completeness
    fix on a section explicitly marked mandatory, nothing invented. Fixed:
    the form now has all 9 fields (`result`/`pending_action`/`blocker`/
    `evidence_ref` inputs, plus an optional intervention-linkage
    dropdown); `page.tsx`'s journal display now also shows the linked
    intervention and evidence reference; `CaseObservation` type completed
    to match the table. Live-verified the full 9-field insert against the
    real schema before writing any code.
  - Loop 35 (last loop of this batch): continued the pack cross-reference
    into §15 (Safety/Technical Stop) and found a real gap:
    `raise_safety_stop` (Loop 13) never sent the notification §15 calls
    mandatory ("Immediate Production Manager notification is mandatory").
    Live-verified before any fix: 271 real stops raised historically,
    zero notifications of any type ever tied to any of them, and
    `SAFETY_STOP_RAISED` wasn't even in the notification-type constraint.
    No Production Manager account exists in this standalone module
    (§3.1's two roles are the only ones) — migration 0015 already solved
    this exact problem for the closely related §13.1 breach notification
    by notifying every active `MAINTENANCE_MANAGER` instead, one function
    below `raise_safety_stop` in the same file; that pattern was simply
    never applied to the raise path itself. Not a security/authority
    bug — the stop's own gating and recording were always correct.
    Fixed: migration 0030 adds `SAFETY_STOP_RAISED` to the notification
    type constraint and applies the existing 0015 substitute-recipient
    pattern to `raise_safety_stop`. Live-verified end to end (real case,
    real manager, exactly one notification with the right case number/
    stop type/reason) before writing the test.

Recurrence status (important): §18 detection is BUILT BUT INERT. It will
  produce nothing at all until the Boss supplies PENDING-04 (threshold +
  window) and a Manager enters it. One deactivated [AUTOTEST] rule remains in
  `recurrence_rules`, labelled "NOT an approved plant threshold"; 0 rules are
  active and the scan returns flags_created: 0.

Demo/test logins (rotate or remove before real rollout):
  Executive:  exec1@monarch.test / Loop1TestPass!23
  Manager:    mgr1@monarch.test  / Loop1TestPass!23
  Technician: tech1@monarch.test / Loop1TestPass!23 (no maintenance.staff
    row — represents a plain technician identity, not Executive/Manager)
  QC:         qc1@monarch.test   / Loop1TestPass!23 (F-01/RISK-23 — no
    maintenance.staff row, holds an active maintenance.qc_authority grant.
    This is the ONLY identity that can record a QC CLEARED/REJECTED
    decision. It is a test/demo grant, NOT a plant QC authority record —
    the real grant is evidence-controlled per §12.)
