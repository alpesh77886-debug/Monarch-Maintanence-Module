# Architecture

## Stack

- **Frontend/app**: Next.js 14 (App Router, TypeScript), deployed on Vercel.
- **Backend**: Supabase — Postgres (schema `maintenance`), Supabase Auth, Row Level
  Security as the server-side authorization boundary (§29 — "the UI is not a
  security boundary").
- **State transitions**: enforced in Postgres via a single RPC
  (`maintenance.transition_case`) that validates the locked lifecycle graph
  (`IMPLEMENTATION_PACK.md` §4) server-side. The UI may hide invalid buttons but the
  RPC is the actual enforcement point (§36.3).
- **Audit**: `maintenance.audit_log` + `maintenance.case_events`, both append-only
  (INSERT-only RLS policies; no UPDATE/DELETE grants for business events).
- **Observability**: Sentry (org `monarch-bo`, project `monarch-maintenance-module`).

## Module boundary

Maintenance owns its own Postgres schema (`maintenance`) inside its own dedicated
Supabase project — not shared with the AOS or Store Register projects, and not
assuming any live Production project exists yet (see CLAUDE.md forensics notes and
RISK-01 in RISK_REGISTER.md). Cross-module references (Production case id, Stores
request id) are stored as plain reference columns/`STORES_REFERENCE_PENDING`-style
sentinels, never as foreign keys into another module's database.

## Why Postgres RPC over app-layer state machine

The pack requires (§36.3) that invalid transitions produce deterministic errors and
that the UI cannot be the only enforcement mechanism. A single server-side RPC that
every client (web app today, any future mobile/API client) must call keeps exactly
one place where the lifecycle graph is encoded, which also gives us a natural point
to write the audit event and check idempotency keys atomically in the same
transaction.
