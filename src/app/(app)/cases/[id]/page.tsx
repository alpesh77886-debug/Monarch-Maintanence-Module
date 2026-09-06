import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AcknowledgeForm from "./acknowledge-form";
import ObservationForm from "./observation-form";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: caseRow } = await supabase.from("cases").select("*").eq("id", id).single();

  if (!caseRow) {
    notFound();
  }

  const { data: isStaffRow } = await supabase
    .from("staff")
    .select("id, role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const { data: events } = await supabase
    .from("case_events")
    .select("*")
    .eq("case_id", id)
    .order("occurred_at", { ascending: true });

  const { data: observations } = await supabase
    .from("observations")
    .select("*")
    .eq("case_id", id)
    .order("created_at", { ascending: true });

  const canAcknowledge =
    !!isStaffRow && ["REPORTED", "NEEDS_INFORMATION"].includes(caseRow.status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-xs text-slate-500">{caseRow.case_number}</p>
        <h1 className="text-lg font-semibold text-slate-900">{caseRow.symptom}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {caseRow.case_type} · Status: <span className="font-medium">{caseRow.status}</span>
          {caseRow.priority ? ` · Priority: ${caseRow.priority}` : ""}
        </p>
      </div>

      {canAcknowledge && <AcknowledgeForm caseId={caseRow.id} />}

      {isStaffRow && caseRow.current_owner_user_id && (
        <ObservationForm caseId={caseRow.id} />
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-900">
          Observation + Action Continuity Journal
        </h2>
        <ol className="mt-2 flex flex-col gap-2">
          {observations?.map((o) => (
            <li key={o.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="text-xs text-slate-400">
                {new Date(o.created_at).toLocaleString()}
              </p>
              {o.observation && <p><span className="font-medium">Observation:</span> {o.observation}</p>}
              {o.action && <p><span className="font-medium">Action:</span> {o.action}</p>}
              {o.result && <p><span className="font-medium">Result:</span> {o.result}</p>}
              {o.current_condition && (
                <p><span className="font-medium">Current condition:</span> {o.current_condition}</p>
              )}
              {o.pending_action && (
                <p><span className="font-medium">Pending:</span> {o.pending_action}</p>
              )}
              {o.blocker && <p><span className="font-medium">Blocker:</span> {o.blocker}</p>}
              {o.next_step && <p><span className="font-medium">Next step:</span> {o.next_step}</p>}
            </li>
          ))}
          {observations?.length === 0 && (
            <p className="text-sm text-slate-500">No journal entries yet.</p>
          )}
        </ol>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Audit trail</h2>
        <ol className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
          {events?.map((e) => (
            <li key={e.id}>
              {new Date(e.occurred_at).toLocaleString()} — {e.event_type}
              {e.previous_status && e.new_status
                ? ` (${e.previous_status} → ${e.new_status})`
                : ""}
              {e.reason ? `: ${e.reason}` : ""}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
