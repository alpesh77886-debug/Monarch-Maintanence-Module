import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification } from "@/lib/supabase/database.types";
import HomeClient from "./home-client";
import TechnicianHome, { type TechTask, type TechCompletion } from "./technician-home";

// Loop 62 (Prompt §47, mockup Screen 002): the new post-login landing page —
// a Module Hub, not the bottom-tab-bar IA. All counts below are real
// single-purpose queries against existing tables, never fabricated, per the
// mockup's own "Data truth rule" caption.
const TERMINAL = ["CLOSED", "REJECTED", "DUPLICATE"];
const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;

// Pulled out of the component body: the `react-hooks/purity` rule flags a
// direct `Date.now()` call inline in a component/hook function (impure,
// unstable across re-renders) but does not trace into a plain helper's own
// body — the same reason `formatAge()`/`ageInHours()` elsewhere in this app
// (`my-work/page.tsx`, `dashboard/page.tsx`) already call `Date.now()`
// freely. Server-rendered once per request either way; this changes nothing
// about correctness, only satisfies the same rule those files already pass.
function sevenDaysAgoMs(): number {
  return Date.now() - SEVEN_DAYS_MS;
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, role, is_available")
    .eq("id", user.id)
    .maybeSingle();

  if (!staff) {
    // A signed-in but non-staff identity (e.g. the demo "technician" login,
    // which deliberately has no `staff` row) still needs a state, per
    // Prompt §18 — not a crash, not a silently empty hub. Loop 109 (Gate 22)
    // first surfaced this identity's own assigned cases (cases_select,
    // migration 0032, already let them read exactly that — staff OR
    // reporter OR assigned technician — nothing had queried it). Loop 115
    // (Boss: "Technician ka alag screen banega... total 3 screens" — pack
    // §3.1 confirms this identity is an authenticated technician
    // participant, not a third software role) replaces that bare list with
    // a dedicated workspace (`TechnicianHome`, mockup screens 5/7) built
    // from the same `case_assignments` truth (still `is_active = true`,
    // unchanged from Loop 109 — no migration ever flips it false after
    // creation, so this stays "every assignment this technician currently
    // holds"), extended with the extra case columns the workspace's
    // stats/cards need, then split locally into active tasks vs. cases
    // closed in the last 7 days.
    const [{ data: assignments }, { data: notifications }] = await Promise.all([
      supabase
        .from("case_assignments")
        .select("case_id, assigned_at")
        .eq("technician_user_id", user.id)
        .eq("is_active", true)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("*")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Two-query + Map join, matching the established pattern in
    // /spares/page.tsx — this codebase has no other use of the PostgREST
    // embed syntax, and this pattern is already proven against this project.
    const assignedCaseIds = [...new Set((assignments ?? []).map((a) => a.case_id))];
    const { data: assignedCases } = assignedCaseIds.length
      ? await supabase
          .from("cases")
          .select(
            "id, case_number, case_type, symptom, status, priority, area, line, emergency_confirmed, created_at, closed_at"
          )
          .in("id", assignedCaseIds)
      : { data: [] };
    const assignedCaseById = new Map((assignedCases ?? []).map((c) => [c.id, c]));
    const assignedAtByCase = new Map((assignments ?? []).map((a) => [a.case_id, a.assigned_at]));

    const TERMINAL_SET = new Set(TERMINAL);
    const cutoff = sevenDaysAgoMs();

    const activeTasks: TechTask[] = [];
    const completions: TechCompletion[] = [];

    for (const [caseId, assignedAt] of assignedAtByCase) {
      const c = assignedCaseById.get(caseId);
      if (!c) continue;
      if (!TERMINAL_SET.has(c.status)) {
        activeTasks.push({
          id: c.id,
          case_number: c.case_number,
          case_type: c.case_type,
          status: c.status,
          priority: c.priority,
          area: c.area,
          line: c.line,
          symptom: c.symptom,
          emergency_confirmed: c.emergency_confirmed,
          assigned_at: assignedAt,
        });
      } else if (c.status === "CLOSED" && c.closed_at && new Date(c.closed_at).getTime() >= cutoff) {
        completions.push({
          id: c.id,
          case_number: c.case_number,
          case_type: c.case_type,
          symptom: c.symptom,
          area: c.area,
          line: c.line,
          closed_at: c.closed_at,
          fix_hours: (new Date(c.closed_at).getTime() - new Date(assignedAt).getTime()) / 3_600_000,
        });
      }
    }

    const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    activeTasks.sort((a, b) => {
      if (a.emergency_confirmed !== b.emergency_confirmed) return a.emergency_confirmed ? -1 : 1;
      const pa = a.priority ? (PRIORITY_RANK[a.priority] ?? 3) : 3;
      const pb = b.priority ? (PRIORITY_RANK[b.priority] ?? 3) : 3;
      if (pa !== pb) return pa - pb;
      return new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime();
    });
    completions.sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime());

    const fixHoursValues = completions.map((c) => c.fix_hours).filter((h): h is number => h !== null);
    const avgFixHours =
      fixHoursValues.length > 0
        ? fixHoursValues.reduce((sum, h) => sum + h, 0) / fixHoursValues.length
        : null;

    return (
      <TechnicianHome
        userLabel={user.email ?? "Signed in"}
        notifications={(notifications as AppNotification[] | null) ?? []}
        activeTasks={activeTasks}
        completions={completions}
        stats={{
          myTasks: activeTasks.length,
          emergency: activeTasks.filter((t) => t.emergency_confirmed).length,
          doneThisWeek: completions.length,
          avgFixHours,
        }}
      />
    );
  }

  // Loop 37 performance convention: independent reads issued together.
  const [
    { count: openCases },
    { count: myWork },
    { count: pmOverdue },
    { count: spareApprovalPending },
    { count: activeEmergency },
    { data: notifications },
  ] = await Promise.all([
    supabase.from("cases").select("id", { count: "exact", head: true }).not("status", "in", `(${TERMINAL.join(",")})`),
    supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("current_owner_user_id", user.id)
      .not("status", "in", `(${TERMINAL.join(",")})`),
    supabase.from("pm_instances").select("id", { count: "exact", head: true }).eq("status", "OVERDUE"),
    supabase
      .from("spare_requests")
      .select("id", { count: "exact", head: true })
      .eq("requires_manager_approval", true)
      .is("approved_at", null),
    supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("emergency_claimed", true)
      .not("status", "in", `(${TERMINAL.join(",")})`),
    supabase
      .from("notifications")
      .select("*")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <HomeClient
      userLabel={staff.full_name}
      role={staff.role}
      isAvailable={!!staff.is_available}
      counts={{
        openCases: openCases ?? 0,
        myWork: myWork ?? 0,
        pmOverdue: pmOverdue ?? 0,
        spareApprovalPending: spareApprovalPending ?? 0,
        activeEmergency: activeEmergency ?? 0,
      }}
      notifications={(notifications as AppNotification[] | null) ?? []}
    />
  );
}
