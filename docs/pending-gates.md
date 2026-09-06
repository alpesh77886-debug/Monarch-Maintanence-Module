# PENDING / Evidence-Controlled Gates (IMPLEMENTATION_PACK.md §35)

| Gate | Needs | Current implementation stance |
|---|---|---|
| PENDING-01 | LOTO/PTW plant SOP: issuer, performer, permit authority, authorized-person matrix, exact permit types | Data model has `ptw_required`, `ptw_proof_ref` seam columns only. No authority logic invented. Governed work path is blocked pending real SOP. |
| PENDING-02 | Production↔Maintenance hybrid integration contract (sync direction, reconciliation, failure handling, audit semantics) | Currently moot in practice: `Monarch-Production-Module` has no live schema yet either. Maintenance stores plain reference-id columns only; no live orchestration attempted. |
| PENDING-03 | Final granular permission matrix beyond the 2 locked roles | Only the explicitly locked authority boundaries (§3, §29) are enforced. No invented finer-grained rules. |
| PENDING-04 | Recurrence threshold/window values | Recurrence flag column + config table exist as a seam; no default threshold is treated as business truth until Boss approves one. |
| PENDING-05 | Any newly discovered plant-specific closure blocker | None discovered yet. If one surfaces during implementation, this file and RISK_REGISTER.md will be updated and the Boss will be asked before any contract change. |
