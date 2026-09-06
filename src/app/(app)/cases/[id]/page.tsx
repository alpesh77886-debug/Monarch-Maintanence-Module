import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AcknowledgeForm from "./acknowledge-form";
import ObservationForm from "./observation-form";
import AssignTechnicianForm from "./assign-technician-form";
import InterventionForm from "./intervention-form";
import WaitingForm from "./waiting-form";
import WaitingActiveCard from "./waiting-active-card";
import RestorationForm from "./restoration-form";
import VerifyRestorationCard from "./verify-restoration-card";
import QcPanel from "./qc-panel";
import CloseReopenActions from "./close-reopen-actions";
import FollowUpButton from "./follow-up-button";

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

  const { data: assignments } = await supabase
    .from("case_assignments")
    .select("*")
    .eq("case_id", id)
    .order("assigned_at", { ascending: true });

  const { data: interventions } = await supabase
    .from("interventions")
    .select("*")
    .eq("case_id", id)
    .order("started_at", { ascending: true });

  const canAcknowledge =
    !!isStaffRow && ["REPORTED", "NEEDS_INFORMATION"].includes(caseRow.status);

  const isAssignedTechnician =
    !!user && (assignments ?? []).some((a) => a.technician_user_id === user.id && a.is_active);
  const canRecordIntervention = !!isStaffRow || isAssignedTechnician;

  const { data: activeWait } = await supabase
    .from("waits")
    .select("*")
    .eq("case_id", id)
    .is("resumed_at", null)
    .maybeSingle();

  const { data: pendingRestoration } = await supabase
    .from("restorations")
    .select("*")
    .eq("case_id", id)
    .eq("restoration_type", "TECHNICAL")
    .is("verification_result", null)
    .maybeSingle();

  const { data: pendingClearance } = await supabase
    .from("clearances")
    .select("*")
    .eq("case_id", id)
    .eq("decision", "PENDING")
    .maybeSingle();

  // TEMPORARILY_RESTORED has no direct edge to TECHNICALLY_RESTORED in the
  // locked lifecycle graph (only IN_REPAIR does) — see FollowUpButton.
  const canRecordRestoration = !!isStaffRow && caseRow.status === "IN_REPAIR";
  const needsFollowUp = !!isStaffRow && caseRow.status === "TEMPORARILY_RESTORED";

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

      {activeWait ? (
        <WaitingActiveCard wait={activeWait} />
      ) : (
        isStaffRow && <WaitingForm caseId={caseRow.id} />
      )}

      {isStaffRow && <AssignTechnicianForm caseId={caseRow.id} />}

      {canRecordIntervention && user && (
        <InterventionForm caseId={caseRow.id} currentUserId={user.id} />
      )}

      {pendingRestoration ? (
        <VerifyRestorationCard restoration={pendingRestoration} />
      ) : needsFollowUp ? (
        <FollowUpButton caseId={caseRow.id} />
      ) : (
        canRecordRestoration && <RestorationForm caseId={caseRow.id} />
      )}

      {isStaffRow && (
        <QcPanel
          caseId={caseRow.id}
          status={caseRow.status}
          qcRequired={caseRow.qc_required}
          pendingClearance={pendingClearance ?? null}
        />
      )}

      {isStaffRow && <CloseReopenActions caseId={caseRow.id} status={caseRow.status} />}

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Assigned technicians</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-700">
          {assignments?.map((a) => (
            <li key={a.id}>
              {a.technician_user_id}
              {a.emergency_direct_start ? " (emergency direct start)" : ""}
              {!a.is_active ? " — inactive" : ""}
            </li>
          ))}
          {assignments?.length === 0 && (
            <p className="text-sm text-slate-500">No technicians assigned yet.</p>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Interventions</h2>
        <ol className="mt-2 flex flex-col gap-2">
          {interventions?.map((i) => (
            <li key={i.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="text-xs text-slate-400">{new Date(i.started_at).toLocaleString()}</p>
              <p><span className="font-medium">Action:</span> {i.action_taken}</p>
              {i.result && <p><span className="font-medium">Result:</span> {i.result}</p>}
              {i.failure_mode && (
                <p><span className="font-medium">Failure mode:</span> {i.failure_mode}</p>
              )}
            </li>
          ))}
          {interventions?.length === 0 && (
            <p className="text-sm text-slate-500">No interventions recorded yet.</p>
          )}
        </ol>
      </section>

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
