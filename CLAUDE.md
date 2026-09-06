# CLAUDE.md — Operating Rules for This Repository

This repository implements **MONARCH — Maintenance Module**.

## Source of truth

`IMPLEMENTATION_PACK.md` is the master, LOCKED implementation contract. It is the
complete, unabridged v0.2 pack. Any Claude Code session working in this repo MUST
read it before making architectural or business-logic decisions.

Priority order when sources conflict:

1. `IMPLEMENTATION_PACK.md` (this repo)
2. Explicit Boss (repo owner) approval messages given after a 5-loop gate
3. Existing repository evidence / existing infra config
4. Existing code/tests/docs
5. External tooling docs (framework/Vercel/Sentry/Supabase docs — HOW, never WHAT)

## Non-negotiable rules

- The Maintenance case lifecycle, roles (`MAINTENANCE_EXECUTIVE`, `MAINTENANCE_MANAGER`),
  ₹12,000 financial authority boundary, WAITING/emergency/QC/production-release
  boundaries in the pack are **LOCKED**. Do not invent, weaken, or silently reinterpret them.
- No business-rule invention. No invented plant SOP, LOTO/PTW authority, SLA, or
  recurrence threshold — these are `PENDING` per Section 35 and must stay PENDING
  until the Boss supplies evidence.
- No silent architecture drift. Any deviation needs a Change Control entry
  (`IMPLEMENTATION_PACK.md` §42) and explicit Boss approval.
- No destructive history rewriting. `maintenance_case_events` / `maintenance_audit_log`
  are append-only. Corrections are new rows, never UPDATE/DELETE of business history.
- Every material state change must be testable and auditable — server-side enforced,
  never UI-only.
- Maintenance MUST NOT become a second source of truth for Production breakdowns
  or Stores inventory. Cross-module references are allowed; duplicated authority is not.
- **"Green build" does not equal "correct product."** A deploy that builds and loads
  is not evidence that lifecycle rules, RBAC, or audit trails are correct.

## 5-loop Boss approval gate

Claude Code works in discrete engineering loops (`IMPLEMENTATION_PACK.md` §19.9).
After **every 5th completed loop** (Loop 5, 10, 15, 20, ...), Claude Code MUST STOP,
write `APPROVAL_REPORT_LOOP_<start>_<end>.md`, and wait for the Boss to explicitly
say something equivalent to "Approved, continue next 5 loops." Silence, "looks good",
or an unrelated reply is NOT approval. This applies for the lifetime of this repo.

## Repository forensics on record (do not re-derive blindly — verify if stale)

- This repo (`alpesh77886-debug/Monarch-Maintanence-Module`) was created 2026-09-06,
  minutes after the sibling `Monarch-Production-Module` repo. Both started as a
  placeholder `index.html` only — **no pre-existing Maintenance or Production
  application code existed** at the start of implementation.
- `Monarch-Production-Module` (sibling repo, same GitHub account) is ALSO placeholder-only
  as of this writing. The `production.breakdowns` / `production.breakdown_events` /
  lifecycle RPC substrate described in `IMPLEMENTATION_PACK.md` §2.2 does **not yet
  exist in code**. Treat Production cross-references as forward-looking reference
  columns only (per §2.1/§2.2) — there is nothing live to integrate with yet.
- The account has two Supabase projects: `wpgepyxvtezovsaqzcie` ("alpesh77886-debug's
  Project", ACTIVE) which is the backing store for the unrelated `accountoperatingsystem`
  (AOS) app (generic `app_users`/`tasks` model, roles `senior_manager` /
  `assistant_manager` / `team_member` — NOT the Maintenance role model), and
  `edjelvusfiduwsqhfiqc` ("monarch-store-register", INACTIVE/paused) backing the
  `Raccoon` Store Register repo. **Neither is semantically Maintenance's substrate.**
  Maintenance gets its own dedicated Supabase project per §2.1 (standalone module).
- Vercel team `Monarch` (`monarch-92be`) already hosts `monarch-production-module` and
  `accountoperatingsystem` projects. No Maintenance project existed yet — created as
  part of this implementation.
- Sentry org `monarch-bo` already has `aos-production` and `monarch-production-module`
  projects. No Maintenance project existed yet — created as part of this implementation.

Re-verify the above before trusting it if significant time has passed — infra can change.

## Working conventions

- Stack: Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, RLS) + Vercel + Sentry.
- Backend truth before UI convenience (§36.2): migrations → state machine → authz →
  audit/idempotency → business ops → API → UI → notifications → KPIs → tests → E2E.
- All Maintenance tables live in a dedicated `maintenance` Postgres schema, not `public`,
  to keep this module's truth clearly separated from any other MONARCH module sharing
  the same Supabase organization in future.
- Migrations are plain SQL files under `supabase/migrations/`, applied via the Supabase
  MCP `apply_migration` tool (no local Supabase CLI available in this environment).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
