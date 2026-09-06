# Risk Register

| ID | Description | Severity | Affected area | Evidence | Mitigation | Owner/next action | State |
|---|---|---|---|---|---|---|---|
| RISK-01 | `IMPLEMENTATION_PACK.md` §2.2 assumes a live Production breakdown substrate (`production.breakdowns`, RPCs, audit log) that does not exist in code yet — `Monarch-Production-Module` repo is placeholder-only. | MEDIUM | Cross-module integration (§2.2, §13) | Cloned sibling repo, found only `index.html`/README. | Build Maintenance fully standalone per §2.1; store only reference-ID columns; do not block on Production substrate. Re-check when Production module ships real schema. | Boss / re-check before enabling any live cross-reference | OPEN |
| RISK-02 | LOTO/PTW plant SOP (issuer/performer/permit authority/authorized-person matrix) is unresolved (PENDING-01). | HIGH (safety-adjacent) | Safety gate (§14) | Pack explicitly marks PENDING-01. | Build feature-flagged seam (PTW Required Y/N, proof reference) without inventing authority. Governed work path blocked until Boss supplies SOP. | Boss to supply plant SOP evidence | OPEN |
| RISK-03 | Recurrence threshold/window values unresolved (PENDING-04). | LOW | Recurrence detection (§18) | Pack explicitly marks PENDING-04. | Ship configurable hybrid model with no default hard-coded threshold treated as business truth; require explicit config before flag is trusted operationally. | Boss to approve threshold/window | OPEN |
| RISK-04 | Exact granular permission matrix (action/field level) beyond the 2 locked roles is unresolved (PENDING-03). | MEDIUM | RBAC (§29) | Pack explicitly marks PENDING-03. | Implement the 2 locked roles + server-side checks for every locked authority boundary explicitly stated in the pack (e.g. ₹12,000 split, reopen = Exec+Manager); do not invent finer-grained rules beyond what's locked. | Boss to verify before production rollout | OPEN |

Resolved risks will remain listed here (state changed to RESOLVED) rather than deleted.
