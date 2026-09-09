import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CaseStatus, MaintenanceCase, StaffMember } from "@/lib/supabase/database.types";
import { StatCard, BarBreakdown, Icons } from "@/components/stat-card";
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
    .select("id")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isStaffRow) {
    return (
      <p className="rounded-lg border border-dashed border-line2 p-6 text-center text-sm text-muted">
        The shift dashboard is visible to Maintenance staff only.
      </p>
    );
  }

  // Loop 37 (performance): three independent reads, issued together instead
  // of one after the other. Queries themselves unchanged.
  const [{ data: allCases }, { data: staff }, { data: overduePm }] = await Promise.all([
    supabase
      .from("cases")
      .select("id, case_number, status, priority, symptom, current_owner_user_id, created_at, closed_at")
      .order("created_at", { ascending: true }),
    supabase.from("staff").select("id, full_name, role, is_active, is_available"),
    supabase.from("pm_instances").select("id").eq("status", "OVERDUE"),
  ]);

  const cases = (allCases ?? []) as Pick<
    MaintenanceCase,
    | "id"
    | "case_number"
    | "status"
    | "priority"
    | "symptom"
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
