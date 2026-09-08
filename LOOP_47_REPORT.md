# Loop 47 — Vercel/Sentry runtime config audit

Second loop of the Boss-approved "Type A" scope. No prior loop had ever swept
the deployed runtime configuration — every loop so far audited the database
and the application code. This one audits the platform underneath both.

No migration and no application code change in this loop — infrastructure
audit plus Sentry issue triage only.

---

## Vercel

### Deployment protection — off, and that is consistent with the app's own model

| Setting | State |
|---|---|
| Password protection | disabled |
| Vercel Authentication (SSO) | disabled |
| Trusted IPs | disabled |

**Not treated as a defect.** This app's authorization boundary is Supabase
auth + RLS, not network-level access control — every route under
`src/app/(app)/` requires a signed-in session, and Loop 44 (RISK-29) already
closed the gap where an unauthenticated caller could reach the database
directly. Anyone who finds a preview URL reaches a login page, not data.
Recorded here rather than silently assumed, because it is a real fact about
the deployment that a future reader should not have to rediscover: **every PR
branch gets its own live, publicly reachable preview URL**, and there are 3
public production domains
(`monarch-maintenance-module.vercel.app` and two aliases).

### The GitHub repository is public

`githubRepoVisibility: "public"`, confirmed from deployment metadata. Source
code, commit history, CI logs, and PR discussions are all publicly visible.
No secret has ever been committed (verified across this session's own commits
and consistent with F-05's finding that the anon key is a designed-public
value) — but repository visibility is an account-level setting, not something
in this repo's control, and changing it is the Boss's call, the same way the
shared test/production Supabase project question is. **Reported, not
changed.**

### Region / build config

`vercel.json` still pins `regions: ["sin1"]` from the original performance fix
(co-located with the Supabase `ap-southeast-1` project). No drift found.

### Environment variables — only two, both correctly public

```
grep -rn "process\.env\." src/
```

found exactly four usages, all safe:

| Variable | Where | Correct to be public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase/config.ts` | yes — Supabase's own design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/config.ts` | yes — protected by RLS, hardened through Loops 43–45 |
| `VERCEL_ENV` / `NODE_ENV` | `src/instrumentation*.ts` | yes — only used to tag the Sentry environment |

No `service_role` key or any other secret is referenced anywhere in `src/`. No
env-var listing tool was available in this session's Vercel MCP surface, which
is itself appropriate — reading secret *values* is not something this audit
should be able to do.

---

## Sentry

### DSN and PII — correct defaults, not a gap

The DSN is hardcoded in both `instrumentation.ts` (server) and
`instrumentation-client.ts` (client), with a comment correctly identifying it
as a public, submit-only identifier — same category as the Supabase
publishable key. `@sentry/nextjs` is pinned at `^10.73.0`; SDK v8+ defaults
`sendDefaultPii` to `false`, so the absence of an explicit setting is the safe
default, not an oversight.

`SENTRY_AUTH_TOKEN` is not configured in this environment, so source-map
upload is skipped (documented in `next.config.ts`) — stack traces in Sentry
are minified. A minor observability gap, not a security one: it means *less*
is uploaded to Sentry, not more.

### Two "unresolved" issues — both stale, both now resolved

`is:unresolved` (90-day window) returned exactly 2 issues. Read in full
rather than assumed stale from the title:

| Issue | Culprit | First/Last seen | Users impacted |
|---|---|---|---|
| MONARCH-MAINTENANCE-MODULE-2 | `isPriorityLockedByManager()` called from server | 2026-09-06 19:59–20:03 | **0** |
| MONARCH-MAINTENANCE-MODULE-3 | generic "Server Components render" error | 2026-09-06 19:59–20:03 (identical `trace_id`) | **0** |

**Confirmed dead, not live**, from the event detail itself:

- `url: http://127.0.0.1:3100/...` — the local Playwright e2e server
  (`E2E_PORT` in `playwright.config.ts`), not a real deployment.
- `server_name: runnervmejwal` — a GitHub Actions runner.
- `release: 12d231e...` and the timestamp window match **Loop 16's**
  `"use client"` boundary defect, fixed the same day
  (commit `7f4099c`, "Fix CI: server component called a function exported
  from a 'use client' file").
- `isPriorityLockedByManager` does not exist anywhere in the current source
  tree (`git grep` across the full tree, zero matches).
- Every subsequent loop's `"use client"` boundary re-scan (anchored regex,
  all 36 client components) has been clean — including this loop's.
- First seen equals last seen: one CI run's burst of failures before the fix
  landed, never recurred.
- Issue #3 shares the exact same `trace_id` as #2 — it is the generic
  client-side echo of the same server-side throw, not an independent defect.

**Both resolved in Sentry** with a comment recording the full root-cause
chain, so a future reader hits the explanation immediately rather than
re-investigating a two-day-old, already-dead error. This is a housekeeping
action, not a code change — nothing in the repository was touched to produce
this result.

---

## What this confirms, and what it doesn't

This loop is evidence that the standing `"use client"` boundary rule (written
after the Loop 16 incident, re-verified every single loop since) has held:
the only trace of that defect left anywhere was two stale Sentry rows, not a
live recurrence. It also confirms Loop 44's anon lockdown is doing its job at
the platform edge — deployment protection being off is safe specifically
*because* the database no longer trusts an unauthenticated caller for
anything.

It does **not** clear the shared test/production Supabase project question or
the public-repository fact — both are reported for the Boss's decision, not
resolved here, for the same reason as always: **this is not something Claude
can invent an answer to.**

---

## Checks

No code changed, so `tsc`/`lint`/`build` were not re-run for this loop — the
working tree is identical to Loop 46's merged state. Sentry's issue queue was
re-queried after resolving to confirm zero unresolved issues remain.
