import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateRecurrenceRuleForm from "./create-recurrence-rule-form";
import RecurrenceRuleCard from "./recurrence-rule-card";
import { Badge, EmptyState } from "@/components/ui";
import type { RecurrenceRule } from "@/lib/supabase/database.types";

const CAPA_STATUS_TONE: Record<string, "warn" | "success" | "danger"> = {
  OPEN: "warn",
  VERIFIED_EFFECTIVE: "success",
  VERIFIED_NOT_EFFECTIVE: "danger",
};

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

  // Loop 119 (Boss: "Manager ke 4 screens" — mockup screen 4, "Manager —
  // Recurrence & CAPA"): a plant-wide view of active recurrence flags and
  // CAPA items, alongside the rule-configuration tool this page already
  // was. Both `recurrence_flags`/`capa_links` are staff-select, plant-wide
  // (migration 0018/0002), not case-scoped — same read scope the existing
  // per-case `recurrence-capa-panel.tsx` already relies on, just not
  // previously aggregated anywhere. Loop 37 performance convention:
  // independent reads issued together.
  const [{ data: rules }, { data: staff }, { data: flags }, { data: capas }] = await Promise.all([
    supabase.from("recurrence_rules").select("*").order("created_at", { ascending: false }),
    supabase.from("staff").select("id, full_name"),
    supabase
      .from("recurrence_flags")
      .select("id, case_id, related_case_ids, flagged_at, match_value, status")
      .eq("status", "SUSPECTED")
      .order("flagged_at", { ascending: false }),
    supabase.from("capa_links").select("*").order("created_at", { ascending: false }),
  ]);
  const nameById = new Map((staff ?? []).map((s) => [s.id, s.full_name as string]));

  const flagRows = flags ?? [];
  const capaRows = capas ?? [];
  const caseIds = [
    ...new Set([...flagRows.map((f) => f.case_id), ...capaRows.map((c) => c.case_id)]),
  ];
  const { data: relatedCases } = caseIds.length
    ? await supabase.from("cases").select("id, case_number, symptom, area, line").in("id", caseIds)
    : { data: [] as { id: string; case_number: string; symptom: string; area: string | null; line: string | null }[] };
  const caseById = new Map((relatedCases ?? []).map((c) => [c.id, c]));

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

      <section>
        <h2 className="text-sm font-semibold text-fg">Suspected recurrence</h2>
        {flagRows.length === 0 ? (
          <EmptyState title="No suspected recurrence right now." className="mt-2" />
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {flagRows.map((f) => {
              const c = caseById.get(f.case_id);
              const caseCount = f.related_case_ids.length + 1;
              return (
                <li key={f.id}>
                  <Link
                    href={`/cases/${f.case_id}`}
                    className="block rounded-xl border border-warn/25 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted">{c?.case_number ?? "unavailable"}</span>
                      <Badge tone="warn">Suspected</Badge>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-fg">{c?.symptom ?? "case unavailable"}</p>
                    <p className="mt-1 text-xs text-muted">
                      {caseCount} case{caseCount === 1 ? "" : "s"} matched
                      {f.match_value ? ` on ${f.match_value}` : ""}
                      {(c?.area || c?.line) ? ` · ${[c?.area, c?.line].filter(Boolean).join(" · ")}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-fg">CAPA actions (§19)</h2>
        {capaRows.length === 0 ? (
          <EmptyState title="No CAPA raised yet." className="mt-2" />
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {capaRows.map((capa) => {
              const c = caseById.get(capa.case_id);
              return (
                <li key={capa.id}>
                  <Link
                    href={`/cases/${capa.case_id}`}
                    className="block rounded-xl border border-line bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{capa.title}</span>
                      <Badge tone={CAPA_STATUS_TONE[capa.status] ?? "warn"}>
                        {capa.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {c?.case_number ?? "case unavailable"} · Owner: {nameById.get(capa.owner_user_id) ?? "unknown"}
                    </p>
                    {capa.source === "SYSTEM_SUGGESTED" && (
                      <p className="mt-1 text-[10px] text-muted2">
                        System-suggested from a confirmed recurrence — Manager confirmed by raising it
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
