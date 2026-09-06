# Tests

Placeholder — no automated unit/integration test framework is wired up yet
(see RISK-07 in `RISK_REGISTER.md`). Backend logic for Loop 1 was verified
manually against Postgres; see `CHANGELOG.md` Loop 1 entry for the exact
scenarios covered. Browser E2E lives in `../e2e/`.

Planned: Vitest for RPC/business-logic unit tests once there is a code layer
above raw SQL (an API/service layer, per `IMPLEMENTATION_PACK.md` §36.2),
plus direct Postgres-level tests for the state machine (`status_transitions`,
`transition_case`, `take_ownership`, `acknowledge_case`, `reopen_case`)
covering the full matrix in §37, not just the subset spot-checked in Loop 1.
