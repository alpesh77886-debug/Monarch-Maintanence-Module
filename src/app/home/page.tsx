import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppNotification } from "@/lib/supabase/database.types";
import HomeClient, { type AssignedCase } from "./home-client";

// Loop 62 (Prompt §47, mockup Screen 002): the new post-login landing page —
// a Module Hub, not the bottom-tab-bar IA. All counts below are real
// single-purpose queries against existing tables, never fabricated, per the
// mockup's own "Data truth rule" caption.
const TERMINAL = ["CLOSED", "REJECTED", "DUPLICATE"];

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
    // Prompt §18 — not a crash, not a silently empty hub. Loop 109 (Gate 22):
    // this used to be the whole story — a warning banner and one generic
    // "Cases" tile, with no visibility into the technician's own assigned
    // work at all, even though cases_select (migration 0032) already lets
    // them read exactly that (staff OR reporter OR assigned technician).
    // Real gap, not a permissions one: the data was reachable, nothing
    // surfaced it. Fixed by actually querying their active assignments —
    // notifications too, since notifications_select is recipient-scoped by
    // auth.uid(), not staff-gated, so a technician can already receive
    // e.g. a handover or acknowledgement notification and previously had
    // no way to see it.
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
          .select("id, case_number, symptom, status, priority, area, line")
          .in("id", assignedCaseIds)
      : { data: [] as AssignedCase[] };
    const assignedCaseById = new Map((assignedCases ?? []).map((c) => [c.id, c as AssignedCase]));

    const myAssignedCases: AssignedCase[] = (assignments ?? [])
      .map((a) => assignedCaseById.get(a.case_id))
      .filter((c): c is AssignedCase => !!c);

    return (
      <HomeClient
        userLabel={user.email ?? "Signed in"}
        role={null}
        isAvailable={false}
        counts={{ openCases: 0, myWork: 0, pmOverdue: 0, spareApprovalPending: 0, activeEmergency: 0 }}
        notifications={(notifications as AppNotification[] | null) ?? []}
        isStaff={false}
        myAssignedCases={myAssignedCases}
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
      isStaff
    />
  );
}
