import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CaseStatus, MaintenanceCase, StaffMember } from "@/lib/supabase/database.types";
import { StatCard, BarBreakdown, TrendChart, Icons } from "@/components/stat-card";
import { statusFillClass } from "@/components/ui";

// §22 shift-handover dashboard: total open, Executive-wise pending/completed,
// unassigned, aging, priority/status, current owner.
//
// On "overdue/aging": this shows AGE, not "overdue". No case-level SLA exists
// in the locked pack, and inventing a threshold to colour cases red would be
// exactly the kind of business-rule invention CLAUDE.md prohibits. PM
// instances are different — their OVERDUE status comes from a due date
// derived from an explicitly supplied frequency, so that count is real and is
// shown as such.

const TERMINAL = ["CLOSED", "REJECTED", "DUPLICATE"];

// Loop 119 (Boss: "Manager ke 4 screens" — mockup screen 3, "Manager —
// Team & Authority"). Static, LOCKED reference content, not per-request
// data — same class as displaying any other pack-locked policy text, so
// hardcoding it here (rather than a query) is not business-rule invention.
// Sourced from `AUTHORITY_MATRIX.md`'s "Action authority" table, itself
// re-verified this same loop against the actual current migration SQL —
// this repo had a real, documented case of that file drifting from the
// code (RISK-37: Reopen and QC Clear/Reject both went stale after later
// migrations corrected them), so this list is a condensed copy of the
// now-corrected file, not an independent re-derivation that could drift
// again on its own.
const AUTHORITY_ROWS: {
  action: string;
  exec: boolean;
  execNote: string;
  mgr: boolean;
  mgrNote: string;
}[] = [
  { action: "Acknowledge / take ownership", exec: true, execNote: "Yes", mgr: true, mgrNote: "Yes" },
  { action: "Close case", exec: true, execNote: "Yes", mgr: true, mgrNote: "Yes" },
  { action: "Reopen case (§3.2)", exec: false, execNote: "No", mgr: true, mgrNote: "Yes — only" },
  { action: "Spares ≤ ₹12,000 (§3.3)", exec: true, execNote: "Auto (within authority)", mgr: true, mgrNote: "Yes" },
  { action: "Spares > ₹12,000 (§3.3)", exec: false, execNote: "No", mgr: true, mgrNote: "Required" },
  {
    action: "Set / change priority (§5.4)",
    exec: true,
    execNote: "Yes, until a Manager locks it",
    mgr: true,
    mgrNote: "Yes, and locks it",
  },
  { action: "Confirm Emergency (§6)", exec: true, execNote: "Yes", mgr: true, mgrNote: "Yes" },
  { action: "Configure recurrence rule (§18)", exec: false, execNote: "No", mgr: true, mgrNote: "Yes — only" },
  { action: "Verify CAPA effectiveness (§19)", exec: false, execNote: "No", mgr: true, mgrNote: "Yes — only" },
];

function ageInHours(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

function formatAge(iso: string): string {
  const hours = ageInHours(iso);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: isStaffRow } = await supabase
    .from("staff")
    .select("id, role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isStaffRow) {
    return (
      <p className="rounded-lg border border-dashed border-line2 p-6 text-center text-sm text-muted">
        The shift dashboard is visible to Maintenance staff only.
      </p>
    );
  }
  const isManager = isStaffRow.role === "MAINTENANCE_MANAGER";

  // Loop 37 (performance): independent reads issued together instead of one
  // after the other. Loop 117 added `spare_requests` to the same wave —
  // still just one more parallel read, not a new round trip.
  const [{ data: allCases }, { data: staff }, { data: overduePm }, { data: spareRequests }] =
    await Promise.all([
      supabase
        .from("cases")
        .select(
          "id, case_number, status, priority, symptom, case_type, area, current_owner_user_id, created_at, closed_at"
        )
        .order("created_at", { ascending: true }),
      supabase.from("staff").select("id, full_name, role, is_active, is_available"),
      supabase.from("pm_instances").select("id").eq("status", "OVERDUE"),
      supabase.from("spare_requests").select("case_id, estimated_amount, approved_at"),
    ]);

  const cases = (allCases ?? []) as Pick<
    MaintenanceCase,
    | "id"
    | "case_number"
    | "status"
    | "priority"
    | "symptom"
    | "case_type"
    | "area"
    | "current_owner_user_id"
    | "created_at"
    | "closed_at"
  >[];
  const staffList = (staff ?? []) as StaffMember[];
  const nameById = new Map(staffList.map((s) => [s.id, s.full_name]));

  const open = cases.filter((c) => !TERMINAL.includes(c.status));
  const unassigned = open.filter((c) => !c.current_owner_user_id);
  const closed = cases.filter((c) => c.status === "CLOSED");

  const perStaff = staffList.map((s) => ({
    staff: s,
    pending: open.filter((c) => c.current_owner_user_id === s.id).length,
    completed: closed.filter((c) => c.current_owner_user_id === s.id).length,
  }));

  const oldestOpen = [...open].slice(0, 10);

  // Loop 50: this used to be its own local status->colour map (drifted from
  // the queue card's and case-detail's own copies — three inconsistent
  // opinions on the same 16 states, see SARVAM_VERIFICATION_REPORT.md).
  // Now sourced from the one canonical map in components/ui.tsx.
  const statusCounts = new Map<CaseStatus, number>();
  for (const c of cases) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
  const statusSegments = [...statusCounts.entries()].map(([label, value]) => ({
    label,
    value,
    colorClass: statusFillClass(label),
  }));

  // Loop 116 (Boss: "Manager ke 4 screens... Dashboard 7 charts" — Premium
  // UI v2 mockup screen 1): two of the mockup's 7 charts that need no new
  // query, only grouping the `cases` rows already fetched above by columns
  // already on the row (`case_type`, `area`). Manager-only (`isManager`) —
  // Executive keeps the existing lighter dashboard unchanged, matching the
  // pack's own "Manager Control" framing (mockup app-header subtitle) for
  // the deeper analytics set. `CATEGORY_PALETTE` round-robins the app's own
  // existing bg-* tokens (no new colour introduced) since, unlike case
  // status, case_type/area have no canonical colour mapping to reuse.
  const CATEGORY_PALETTE = ["bg-brand", "bg-teal", "bg-vio", "bg-warn", "bg-bad", "bg-good", "bg-line2"];
  function groupSegments(values: (string | null)[]): { label: string; value: number; colorClass: string }[] {
    const counts = new Map<string, number>();
    for (const v of values) {
      const label = v ?? "Unspecified";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, colorClass: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }));
  }
  const caseTypeSegments = groupSegments(cases.map((c) => c.case_type));
  const areaSegments = groupSegments(cases.map((c) => c.area));

  // Loop 117: two more of the mockup's 7 charts. Both manager-only, both
  // real aggregates of data already modelled elsewhere in the schema — no
  // new business rule invented.
  //
  // "MTTR" in the mockup has no defined formula in the pack (no §25.2
  // clock start/stop is specified as "restoration start" vs "report
  // time") — rather than guess at an industry-standard MTTR definition
  // this codebase has never computed anywhere else, this uses the one
  // cycle-time measure the app already computes elsewhere (TechnicianHome,
  // Loop 115: `closed_at - assigned_at`) and is explicit about scope in its
  // own label: report-to-closure duration, weekly average, last 4 weeks.
  const CYCLE_WEEKS = 4;
  const weekBuckets: { key: string; label: string; hours: number[] }[] = [];
  {
    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setUTCHours(0, 0, 0, 0);
    startOfThisWeek.setUTCDate(startOfThisWeek.getUTCDate() - startOfThisWeek.getUTCDay());
    for (let i = CYCLE_WEEKS - 1; i >= 0; i--) {
      const weekStart = new Date(startOfThisWeek);
      weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
      weekBuckets.push({
        key: weekStart.toISOString().slice(0, 10),
        label: `Wk of ${weekStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}`,
        hours: [],
      });
    }
  }
  for (const c of cases) {
    if (!c.closed_at) continue;
    const closedDate = new Date(c.closed_at);
    const weekStartKey = new Date(
      Date.UTC(closedDate.getUTCFullYear(), closedDate.getUTCMonth(), closedDate.getUTCDate() - closedDate.getUTCDay())
    )
      .toISOString()
      .slice(0, 10);
    const bucket = weekBuckets.find((w) => w.key === weekStartKey);
    if (bucket) {
      bucket.hours.push((closedDate.getTime() - new Date(c.created_at).getTime()) / 3_600_000);
    }
  }
  const cycleTimeWeekly = weekBuckets.map((w) => ({
    label: w.label,
    avgHours: w.hours.length > 0 ? w.hours.reduce((s, h) => s + h, 0) / w.hours.length : null,
  }));

  const areaByCaseId = new Map(cases.map((c) => [c.id, c.area ?? "Unspecified"]));
  const spareSpendByArea = new Map<string, number>();
  for (const sr of spareRequests ?? []) {
    if (!sr.approved_at || !sr.estimated_amount) continue;
    const area = areaByCaseId.get(sr.case_id) ?? "Unspecified";
    spareSpendByArea.set(area, (spareSpendByArea.get(area) ?? 0) + sr.estimated_amount);
  }
  const totalSpareSpend = [...spareSpendByArea.values()].reduce((s, v) => s + v, 0);
  const spareSpendSegments = [...spareSpendByArea.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, colorClass: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }));

  // Loop 110 (Boss: "Manager ke liye better analytics — existing KPI/
  // Dashboard data pe real charts"): a 14-day created-vs-closed volume
  // trend, built from the same `cases` rows already fetched above — no new
  // query, no invented target line (§25.2/CLAUDE.md: no SLA to compare
  // against). Bucket keys use the UTC calendar date embedded in each ISO
  // timestamp on both sides (bucket generation and case lookup) so they
  // line up regardless of server timezone.
  const TREND_DAYS = 14;
  const trendBuckets: { key: string; label: string }[] = [];
  const todayUtc = new Date();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() - i)
    );
    trendBuckets.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }),
    });
  }
  const createdByDay = new Map<string, number>();
  const closedByDay = new Map<string, number>();
  for (const c of cases) {
    const createdKey = c.created_at.slice(0, 10);
    createdByDay.set(createdKey, (createdByDay.get(createdKey) ?? 0) + 1);
    if (c.closed_at) {
      const closedKey = c.closed_at.slice(0, 10);
      closedByDay.set(closedKey, (closedByDay.get(closedKey) ?? 0) + 1);
    }
  }
  const trendSeries = trendBuckets.map((b) => ({
    label: b.label,
    created: createdByDay.get(b.key) ?? 0,
    closed: closedByDay.get(b.key) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-fg">Shift dashboard</h1>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Open cases" value={open.length} icon={Icons.clipboard} tone="info" />
        <StatCard
          label="Unassigned"
          value={unassigned.length}
          tone={unassigned.length ? "warn" : "neutral"}
          icon={Icons.warning}
          sublabel="Needs a Maintenance owner"
        />
        <StatCard label="Closed (all time)" value={closed.length} icon={Icons.check} tone="success" />
        <StatCard
          label="PM overdue"
          value={(overduePm ?? []).length}
          tone={(overduePm ?? []).length ? "warn" : "neutral"}
          icon={Icons.clock}
        />
      </section>

      {cases.length > 0 && (
        <BarBreakdown title="Cases by status (all time)" total={cases.length} segments={statusSegments} />
      )}

      <TrendChart title="Case volume — created vs closed, last 14 days" series={trendSeries} />

      {isManager && cases.length > 0 && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
          <BarBreakdown title="Cases by type (all time)" total={cases.length} segments={caseTypeSegments} />
          <BarBreakdown title="Cases by machine area (all time)" total={cases.length} segments={areaSegments} />
        </div>
      )}

      {isManager && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
          <div className="rounded-lg border border-line bg-card p-3">
            <p className="text-xs font-medium text-muted">
              Case cycle time <span className="text-muted2">Report → closure, weekly avg, last 4 weeks</span>
            </p>
            {cycleTimeWeekly.every((w) => w.avgHours === null) ? (
              <p className="mt-2 text-xs text-muted2">No case closed in this window yet.</p>
            ) : (
              <div className="mt-3 flex items-end justify-between gap-2" style={{ height: 68 }}>
                {cycleTimeWeekly.map((w) => {
                  const maxHours = Math.max(1, ...cycleTimeWeekly.map((x) => x.avgHours ?? 0));
                  return (
                    <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[9px] text-muted2">
                        {w.avgHours !== null ? `${w.avgHours.toFixed(1)}h` : "—"}
                      </span>
                      <div
                        className="w-full max-w-[36px] rounded-t bg-gradient-to-t from-brand2 to-brand"
                        style={{
                          height: w.avgHours !== null ? Math.max(2, Math.round((w.avgHours / maxHours) * 48)) : 2,
                        }}
                      />
                      <span className="text-[9px] text-muted2">{w.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <BarBreakdown
            title="Approved spare spend by area (₹)"
            total={totalSpareSpend}
            segments={spareSpendSegments}
          />
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-fg">By staff member</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-3">Staff</th>
                <th className="py-1 pr-3">Shift</th>
                <th className="py-1 pr-3">Pending</th>
                <th className="py-1">Completed</th>
              </tr>
            </thead>
            <tbody>
              {perStaff.map(({ staff: s, pending, completed }) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-1 pr-3 text-fg">
                    {s.full_name}
                    <span className="ml-1 text-xs text-muted2">
                      {s.role === "MAINTENANCE_MANAGER" ? "Manager" : "Executive"}
                    </span>
                  </td>
                  <td className="py-1 pr-3 text-xs">
                    {s.is_available ? (
                      <span className="text-emerald-300">On shift</span>
                    ) : (
                      <span className="text-muted2">Off shift</span>
                    )}
                  </td>
                  <td className="py-1 pr-3 text-fg">{pending}</td>
                  <td className="py-1 text-fg">{completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isManager && (
        <section>
          <h2 className="text-sm font-semibold text-fg">Authority matrix</h2>
          <p className="mt-1 text-xs text-muted">
            Locked action-level authority (§29), re-verified against the actual RPC/RLS code —
            not this screen&rsquo;s own opinion. Full detail and migration citations:{" "}
            <span className="font-mono text-muted2">AUTHORITY_MATRIX.md</span>.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-1 pr-3">Action</th>
                  <th className="py-1 pr-3">Executive</th>
                  <th className="py-1">Manager</th>
                </tr>
              </thead>
              <tbody>
                {AUTHORITY_ROWS.map((row) => (
                  <tr key={row.action} className="border-t border-line">
                    <td className="py-1 pr-3 text-fg">{row.action}</td>
                    <td className={`py-1 pr-3 text-xs ${row.exec ? "text-emerald-300" : "text-muted2"}`}>
                      {row.exec ? "✓" : "✗"} {row.execNote}
                    </td>
                    <td className={`py-1 text-xs ${row.mgr ? "text-emerald-300" : "text-muted2"}`}>
                      {row.mgr ? "✓" : "✗"} {row.mgrNote}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-muted2">
            QC Clear/Reject is not in this table because neither Executive nor Manager holds it —
            only a separately granted QC-authority identity does (§12, F-01).
          </p>
        </section>
      )}

      {/* Loop 76 (§16 "Responsive Model" harder half, §30 mobile-first
          sweep): Unassigned and Oldest Open are two independent case-lists
          stacked one above the other at every viewport until now - at lg:+
          they run side by side instead, matching the pattern already used
          for Plans/Instances (Loop 74). Below lg: (mobile+tablet), the
          order and stacking are unchanged. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        {unassigned.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-amber-300">
              Unassigned — waiting for a Maintenance owner
            </h2>
            <ul className="mt-2 flex flex-col gap-1">
              {unassigned.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/cases/${c.id}`}
                    className="block rounded-lg border border-warn/25 bg-warn/10 p-2 text-sm"
                  >
                    <span className="font-mono text-xs text-amber-300">{c.case_number}</span>{" "}
                    <span className="text-fg">{c.symptom}</span>
                    <span className="ml-1 text-xs text-muted">
                      · {c.status} · age {formatAge(c.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-fg">Oldest open cases</h2>
          <p className="mt-1 text-xs text-muted">
            Sorted by age. Age is shown as-is — no case-level SLA is defined in the
            approved design, so nothing here is labelled &ldquo;overdue&rdquo;.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {oldestOpen.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cases/${c.id}`}
                  className="block rounded-lg border border-line bg-card p-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{c.case_number}</span>
                    <span className="text-xs text-muted">age {formatAge(c.created_at)}</span>
                  </div>
                  <p className="text-fg">{c.symptom}</p>
                  <p className="text-xs text-muted">
                    {c.status}
                    {c.priority ? ` · ${c.priority}` : ""} ·{" "}
                    {c.current_owner_user_id
                      ? (nameById.get(c.current_owner_user_id) ?? "unknown owner")
                      : "unassigned"}
                  </p>
                </Link>
              </li>
            ))}
            {open.length === 0 && <p className="text-sm text-muted">No open cases.</p>}
          </ul>
        </section>
      </div>
    </div>
  );
}
