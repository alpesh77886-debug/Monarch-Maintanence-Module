# MONARCH — Maintenance Module

Technical control tower for plant maintenance: case intake, diagnosis, restoration,
QC clearance gate, spare traceability, PM, and KPIs — built to the LOCKED contract in
[`IMPLEMENTATION_PACK.md`](./IMPLEMENTATION_PACK.md).

Read [`CLAUDE.md`](./CLAUDE.md) before making any architectural change here.

## Status

Live engineering status: [`STATUS.md`](./STATUS.md)
Change history: [`CHANGELOG.md`](./CHANGELOG.md)
Open risks: [`RISK_REGISTER.md`](./RISK_REGISTER.md)
Latest Boss approval gate: [`APPROVAL_GATE.md`](./APPROVAL_GATE.md)

## Live

- App (branch deploy): https://monarch-maintenance-module-git-claude-new-s-e548d3-monarch-92be.vercel.app
- Demo login (rotate before real rollout): `exec1@monarch.test` / `Loop1TestPass!23`
  (Executive), `mgr1@monarch.test` / `Loop1TestPass!23` (Manager)

## Stack

- **Frontend**: Next.js (App Router, TypeScript), mobile-first
- **Backend**: Supabase (Postgres, Auth, Row Level Security)
- **Hosting**: Vercel (team `Monarch`)
- **Observability**: Sentry (org `monarch-bo`)

## Docs

- [`docs/architecture.md`](./docs/architecture.md)
- [`docs/lifecycle.md`](./docs/lifecycle.md)
- [`docs/permissions.md`](./docs/permissions.md)
- [`docs/evidence-model.md`](./docs/evidence-model.md)
- [`docs/kpi-impact.md`](./docs/kpi-impact.md)
- [`docs/pending-gates.md`](./docs/pending-gates.md)

## Local development

```bash
npm install
npm run dev
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(never commit these — see `.env.example`).
