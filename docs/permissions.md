# Permissions (LOCKED roles — see IMPLEMENTATION_PACK.md §3, §29)

Exactly two software roles in V1:

- `MAINTENANCE_EXECUTIVE`
- `MAINTENANCE_MANAGER`

No separate Technician software role — technicians are individually-identified users
(never a shared login) who appear in `maintenance.case_assignments` /
`maintenance.interventions`, but they do not get a distinct RBAC role in V1.

## Locked authority boundaries implemented server-side (RLS + RPC checks)

- Any valid Executive may close a case where closure is otherwise permitted.
- Reopen requires Executive **or** Manager (either role, not Executive-only).
- Financial/spare authority: request total `<= ₹12,000` → Executive path;
  `> ₹12,000` → requires Manager authority + approval proof before the request can
  proceed (approval proof is a request prerequisite, not automatically a whole-case
  closure blocker — §3.3).
- Priority: Executive can set; Manager has final override.
- Manager-only: PM schedule approval, CAPA ownership/effectiveness, safety/technical
  stop (Executive can also issue a stop per §15), emergency confirmation (Executive
  or Manager, either).

## PENDING-03

Exact field-level/action-level permission matrix beyond what's explicitly locked
above remains PENDING per §35. Nothing beyond the locked boundaries above is
hard-coded as an assumption; do not add finer-grained restrictions without Boss
evidence.
