import { createClient } from "@/lib/supabase/server";
import CreatePlanForm from "./create-plan-form";
import PmPlanCard from "./pm-plan-card";
import PmInstanceCard from "./pm-instance-card";
import type { PmPlan, PmInstance } from "@/lib/supabase/database.types";

// §17: PM plans/instances are staff-only to read (0002 RLS), so this whole
// page is a staff surface — a non-staff signed-in user (a reporter,
// technician) sees a plain notice instead of an empty/broken list.
export default async function PmPage() {
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
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        Preventive maintenance planning is visible to Maintenance staff only.
      </p>
    );
  }

  const isManager = isStaffRow.role === "MAINTENANCE_MANAGER";

  const { data: plans } = await supabase
    .from("pm_plans")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: instances } = await supabase
    .from("pm_instances")
    .select("*")
    .neq("status", "RESCHEDULED")
    .order("due_at", { ascending: true });

  const planTitleById = new Map((plans ?? []).map((p) => [p.id, p.title]));

  const caseIds = (instances ?? []).map((i) => i.case_id).filter((id): id is string => !!id);
  let caseNumberById = new Map<string, string>();
  if (caseIds.length > 0) {
    const { data: linkedCases } = await supabase
      .from("cases")
      .select("id, case_number")
      .in("id", caseIds);
    caseNumberById = new Map((linkedCases ?? []).map((c) => [c.id, c.case_number]));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900">Preventive Maintenance</h1>

      <CreatePlanForm isManager={isManager} />

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Plans</h2>
        <div className="mt-2 flex flex-col gap-2">
          {(plans as PmPlan[] | null)?.map((p) => (
            <PmPlanCard key={p.id} plan={p} isManager={isManager} />
          ))}
          {plans?.length === 0 && (
            <p className="text-sm text-slate-500">No PM plans yet.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Instances</h2>
        <div className="mt-2 flex flex-col gap-2">
          {(instances as PmInstance[] | null)?.map((i) => (
            <PmInstanceCard
              key={i.id}
              instance={i}
              planTitle={planTitleById.get(i.pm_plan_id) ?? "Unknown plan"}
              linkedCaseNumber={i.case_id ? caseNumberById.get(i.case_id) ?? null : null}
            />
          ))}
          {instances?.length === 0 && (
            <p className="text-sm text-slate-500">
              No PM instances yet — approved recurring plans generate these automatically.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
