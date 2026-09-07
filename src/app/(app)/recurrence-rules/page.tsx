import { createClient } from "@/lib/supabase/server";
import CreateRecurrenceRuleForm from "./create-recurrence-rule-form";
import RecurrenceRuleCard from "./recurrence-rule-card";
import type { RecurrenceRule } from "@/lib/supabase/database.types";

// Loop 23: §18 recurrence-rule configuration. `create_recurrence_rule` and
// `set_recurrence_rule_active` have existed since Loop 15 and were fully
// tested at the RPC layer, but nothing in this app could ever call them —
// the only way to configure a tier was direct SQL against the live
// database, which is what every prior loop's own verification runs did and
// then undid. That meant even once the Boss supplies PENDING-04 evidence,
// there was no way for a Manager to actually act on it. This page is that
// tool, not a resolution of PENDING-04 itself — see
// create-recurrence-rule-form.tsx for why nothing here defaults a number.
export default async function RecurrenceRulesPage() {
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
        Recurrence rule configuration is visible to Maintenance staff only.
      </p>
    );
  }

  const isManager = isStaffRow.role === "MAINTENANCE_MANAGER";

  const { data: rules } = await supabase
    .from("recurrence_rules")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: staff } = await supabase.from("staff").select("id, full_name");
  const nameById = new Map((staff ?? []).map((s) => [s.id, s.full_name as string]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Recurrence rules (§18)</h1>
        <p className="mt-1 text-xs text-slate-500">
          A rule flags &ldquo;Recurring Failure Suspected&rdquo; when the threshold is
          met within the window — it never confirms recurrence or declares root
          cause on its own; an Executive or Manager does that from the flagged
          case.
        </p>
      </div>

      {isManager ? (
        <CreateRecurrenceRuleForm />
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          Only a Maintenance Manager may configure a recurrence rule (§18).
        </p>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Configured tiers</h2>
        <div className="mt-2 flex flex-col gap-2">
          {(rules as RecurrenceRule[] | null)?.map((r) => (
            <RecurrenceRuleCard
              key={r.id}
              rule={r}
              isManager={isManager}
              createdByName={nameById.get(r.created_by) ?? "unknown"}
            />
          ))}
          {rules?.length === 0 && (
            <p className="text-sm text-slate-500">
              No recurrence rule configured yet — detection stays dormant until
              one is (PENDING-04).
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
