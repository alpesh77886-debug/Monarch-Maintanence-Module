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
      <p className="rounded-lg border border-dashed border-line2 p-6 text-center text-sm text-muted">
        Recurrence rule configuration is visible to Maintenance staff only.
      </p>
    );
  }

  const isManager = isStaffRow.role === "MAINTENANCE_MANAGER";

  // Loop 37 (performance): the rules and the staff-name lookup are
  // independent — issued together rather than one after the other.
  const [{ data: rules }, { data: staff }] = await Promise.all([
    supabase.from("recurrence_rules").select("*").order("created_at", { ascending: false }),
    supabase.from("staff").select("id, full_name"),
  ]);
  const nameById = new Map((staff ?? []).map((s) => [s.id, s.full_name as string]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-fg">Recurrence rules (§18)</h1>
        <p className="mt-1 text-xs text-muted">
          A rule flags &ldquo;Recurring Failure Suspected&rdquo; when the threshold is
          met within the window — it never confirms recurrence or declares root
          cause on its own; an Executive or Manager does that from the flagged
          case.
        </p>
      </div>

      {isManager ? (
        <CreateRecurrenceRuleForm />
      ) : (
        <p className="rounded-lg border border-dashed border-line2 p-3 text-sm text-muted">
          Only a Maintenance Manager may configure a recurrence rule (§18).
        </p>
      )}

      <section>
        <h2 className="text-sm font-semibold text-fg">Configured tiers</h2>
        {/* Loop 78 (§16 "Responsive Model" harder half, §30 mobile-first
            sweep): same grid treatment as Case Queue/Spares - tablet stays
            single-column per §16's own "breathing room" tablet bullets,
            desktop gets 2-3 columns instead of one long mobile-width list. */}
        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
          {(rules as RecurrenceRule[] | null)?.map((r) => (
            <RecurrenceRuleCard
              key={r.id}
              rule={r}
              isManager={isManager}
              createdByName={nameById.get(r.created_by) ?? "unknown"}
            />
          ))}
          {rules?.length === 0 && (
            <p className="col-span-full text-sm text-muted">
              No recurrence rule configured yet — detection stays dormant until
              one is (PENDING-04).
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
