# Browser E2E

Playwright tests that drive the real UI in a real browser:

```bash
npm run test:e2e
```

## What this is (and why it exists)

`tests/` (Vitest) calls the Supabase RPCs directly — it proves the *backend*
rules hold. It cannot prove that a button is wired to the right RPC, that a
form actually submits, or that the right control is shown to the right role.
That gap is not theoretical in this repo:

- **RISK-10** — login was completely broken in production for five loops.
  Every backend check passed the whole time, because none of them went
  through `signInWithPassword` from a browser.
- **RISK-12** — a "Record restoration" button that always failed, because the
  UI offered it in a status the locked graph has no edge out of.

Both were UI-layer defects. These specs exist so that class of bug fails a
build instead of reaching the plant.

## How it runs

`playwright.config.ts` builds the app and starts it on port 3100, then points
the browser at it. Supabase is reached over the real internet — so this needs
an environment with normal egress.

- **GitHub Actions:** works. Runs as its own `e2e` job on every push/PR
  (`.github/workflows/ci.yml`), after `lint-and-build` passes.
- **This repo's dev sandbox:** does NOT work past the login step — the
  egress proxy policy-blocks `*.supabase.co` (RISK-05). Locally you get as
  far as `/login` rendering (the two signed-out specs pass); everything that
  signs in fails at the network call, not on an assertion. Same limitation
  the Vitest suite has — see `tests/README.md`.

To run against an already-deployed URL instead of a local build:

```bash
E2E_BASE_URL=https://monarch-maintenance-module.vercel.app npm run test:e2e
```

## Accounts and test data

Uses the same seeded demo accounts as the Vitest suite (see `STATUS.md`),
overridable via `E2E_EXEC_EMAIL` / `E2E_EXEC_PASSWORD` and the manager/tech
equivalents. The `technician` account deliberately has no
`maintenance.staff` row — it is how the non-staff paths get exercised.

Cases created here are tagged `[AUTOTEST-E2E]` in the symptom, so they are
trivially identifiable in the live project. As with the Vitest suite, there
is no automated cleanup: the audit-adjacent tables have no `DELETE` policy
for any client role, by design (§0 rule 6, §27), and adding one just for test
convenience would cut against the append-only principle it protects.

## Coverage

| Spec | Covers |
|---|---|
| `case-flow.spec.ts` | signed-out `/login` renders clean (no console/page errors); `/cases` redirects to this app's own login (RISK-08 guard); sign-in (RISK-10 guard) → report → acknowledge → journal → audit trail visible; §6 emergency claim/confirm two-step incl. the reason requirement |
| `roles-and-notifications.spec.ts` | §17 PM surface hidden from non-staff and gated on direct visit; Manager-only PM approval (§17.3); §23 acknowledgement notification reaching the reporter and *not* other staff; §3.3 ₹12,000 spare gate shown correctly and approve control withheld from a non-Manager |
