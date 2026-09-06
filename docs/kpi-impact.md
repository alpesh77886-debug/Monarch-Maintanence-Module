# KPI / Impact Model (IMPLEMENTATION_PACK.md §25)

Not yet implemented (V1 completion is low — see STATUS.md). This file is the seam:
KPIs will be computed from `maintenance.case_events` / `maintenance.pm_instances` /
`maintenance.waits`, never invented as flat numbers.

Planned KPI groups (unchanged from the pack, listed here for traceability):

1. Reliability / Repeat Failure
2. Restoration & Execution
3. Production Impact — minutes + kg
4. Preventive Maintenance
5. Waiting / Dependency
6. Ownership / Workload
7. Quality / Closure
8. Financial Impact — ₹ only where an authoritative basis exists

Rule: missing data must never silently become zero in any KPI calculation. No KPI
target/SLA value is invented — none exists in the locked pack, so none is coded.
