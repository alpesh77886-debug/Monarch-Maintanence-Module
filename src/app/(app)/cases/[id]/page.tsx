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
import EmergencyPanel from "./emergency-panel";
import SparesPanel from "./spares-panel";
import MarkDuplicateForm from "./mark-duplicate-form";
import CloseFalseComplaintForm from "./close-false-complaint-form";
import HandoverForm from "./handover-form";
import ProductionBoundaryPanel from "./production-boundary-panel";
import Link from "next/link";
import type {
  StaffMember,
  SafetyStop,
  ProductionBoundaryEvent,
} from "@/lib/supabase/database.types";

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

  // §16.3: any signed-in user may raise a spare request directly (technician
  // or executive); usage recording follows the same staff-or-assigned-
  // technician rule as interventions (record_spare_usage mirrors
  // record_intervention's actor check).
  const canRaiseSpareRequest = !!user;
  const canRecordSpareUsage = !!isStaffRow || isAssignedTechnician;
  const isManager = isStaffRow?.role === "MAINTENANCE_MANAGER";

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

  const { data: spareRequests } = await supabase
    .from("spare_requests")
    .select("*")
    .eq("case_id", id)
    .order("requested_at", { ascending: true });

  const { data: spareUsage } = await supabase
    .from("spare_usage")
    .select("*")
    .eq("case_id", id)
    .order("used_at", { ascending: true });

  // TEMPORARILY_RESTORED has no direct edge to TECHNICALLY_RESTORED in the
  // locked lifecycle graph (only IN_REPAIR does) — see FollowUpButton.
  const canRecordRestoration = !!isStaffRow && caseRow.status === "IN_REPAIR";
  const needsFollowUp = !!isStaffRow && caseRow.status === "TEMPORARILY_RESTORED";

  // §6: reporter or staff may claim; only staff may confirm, and only once
  // claimed. Not offered once the case is CLOSED/REJECTED/DUPLICATE.
  const caseIsTerminal = ["CLOSED", "REJECTED", "DUPLICATE"].includes(caseRow.status);
  const canClaimEmergency =
    !caseIsTerminal &&
    !caseRow.emergency_confirmed &&
    !!user &&
    (user.id === caseRow.reporter_user_id || !!isStaffRow);
  const canConfirmEmergency =
    !!isStaffRow && caseRow.emergency_claimed && !caseRow.emergency_confirmed;

  // §4.6/§4.7: both scoped to the same statuses their locked status_transitions
  // edges actually allow (REPORTED/ACKNOWLEDGED/ASSESSED -> DUPLICATE;
  // REPORTED -> REJECTED) — the RPCs re-check this server-side regardless.
  const canMarkDuplicate =
    !!isStaffRow && ["REPORTED", "ACKNOWLEDGED", "ASSESSED"].includes(caseRow.status);
  const canCloseFalseComplaint =
    !!user && user.id === caseRow.reporter_user_id && caseRow.status === "REPORTED";

  // §22.2 handover quality: a receiver must be able to see owner history and
  // escalation state, not just the current status — so both are surfaced on
  // the case itself rather than living only in the audit log.
  const { data: ownershipHistory } = await supabase
    .from("case_ownership")
    .select("*")
    .eq("case_id", id)
    .order("started_at", { ascending: true });

  const { data: staffList } = await supabase
    .from("staff")
    .select("id, full_name, role, is_active, is_available")
    .eq("is_active", true);

  const staffById = new Map((staffList ?? []).map((s) => [s.id, s as StaffMember]));

  // §13 production restart boundary.
  const { data: activeStop } = await supabase
    .from("safety_stops")
    .select("*")
    .eq("case_id", id)
    .is("lifted_at", null)
    .maybeSingle();

  const { data: boundaryEvents } = await supabase
    .from("production_boundary_events")
    .select("*")
    .eq("case_id", id)
    .order("recorded_at", { ascending: true });

  let duplicatePrimaryCaseNumber: string | null = null;
  if (caseRow.duplicate_of_case_id) {
    const { data: primaryCase } = await supabase
      .from("cases")
      .select("case_number")
      .eq("id", caseRow.duplicate_of_case_id)
      .maybeSingle();
    duplicatePrimaryCaseNumber = primaryCase?.case_number ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-xs text-slate-500">{caseRow.case_number}</p>
        <h1 className="text-lg font-semibold text-slate-900">{caseRow.symptom}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {caseRow.case_type} · Status: <span className="font-medium">{caseRow.status}</span>
          {caseRow.priority ? ` · Priority: ${caseRow.priority}` : ""}
        </p>
        {caseRow.duplicate_of_case_id && (
          <p className="mt-1 text-sm text-slate-600">
            Duplicate of{" "}
            {duplicatePrimaryCaseNumber ? (
              <Link
                href={`/cases/${caseRow.duplicate_of_case_id}`}
                className="font-medium text-blue-700"
              >
                {duplicatePrimaryCaseNumber}
              </Link>
            ) : (
              caseRow.duplicate_of_case_id
            )}
          </p>
        )}
      </div>

      {canCloseFalseComplaint && <CloseFalseComplaintForm caseId={caseRow.id} />}

      {canMarkDuplicate && <MarkDuplicateForm caseId={caseRow.id} />}

      {(caseRow.emergency_claimed || canClaimEmergency) && (
        <EmergencyPanel
          caseId={caseRow.id}
          emergencyClaimed={caseRow.emergency_claimed}
          emergencyClaimReason={caseRow.emergency_claim_reason}
          emergencyConfirmed={caseRow.emergency_confirmed}
          emergencyConfirmedAt={caseRow.emergency_confirmed_at}
          canClaim={canClaimEmergency}
          canConfirm={canConfirmEmergency}
        />
      )}

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

      <SparesPanel
        caseId={caseRow.id}
        spareRequests={spareRequests ?? []}
        spareUsage={spareUsage ?? []}
        canRaise={canRaiseSpareRequest}
        canRecordUsage={canRecordSpareUsage}
        isManager={isManager}
      />

      {isStaffRow && (
        <QcPanel
          caseId={caseRow.id}
          status={caseRow.status}
          qcRequired={caseRow.qc_required}
          pendingClearance={pendingClearance ?? null}
        />
      )}

      {isStaffRow && <CloseReopenActions caseId={caseRow.id} status={caseRow.status} />}

      {isStaffRow && (
        <ProductionBoundaryPanel
          caseId={caseRow.id}
          status={caseRow.status}
          activeStop={(activeStop as SafetyStop | null) ?? null}
          boundaryEvents={(boundaryEvents ?? []) as ProductionBoundaryEvent[]}
        />
      )}

      {isStaffRow && !caseIsTerminal && (
        <HandoverForm
          caseId={caseRow.id}
          staff={(staffList ?? []) as StaffMember[]}
          currentOwnerId={caseRow.current_owner_user_id}
        />
      )}

      {/* §22.2: the receiver needs escalation state at a glance, not buried
          in the audit trail. */}
      {(caseRow.emergency_confirmed || activeWait?.resume_ready_at) && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-3">
          <h2 className="text-sm font-semibold text-red-900">Escalation state</h2>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-red-900">
            {caseRow.emergency_confirmed && (
              <li>
                Confirmed emergency since{" "}
                {caseRow.emergency_confirmed_at
                  ? new Date(caseRow.emergency_confirmed_at).toLocaleString()
                  : "—"}
                {caseRow.emergency_escalated_at
                  ? ` · escalated ${new Date(caseRow.emergency_escalated_at).toLocaleString()}`
                  : " · 1h escalation clock running"}
              </li>
            )}
            {activeWait?.resume_ready_at && (
              <li>
                Resume-ready since {new Date(activeWait.resume_ready_at).toLocaleString()}
                {activeWait.last_escalated_at
                  ? ` · escalated ${new Date(activeWait.last_escalated_at).toLocaleString()}`
                  : ""}
              </li>
            )}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Ownership history</h2>
        <ol className="mt-2 flex flex-col gap-1 text-sm text-slate-700">
          {ownershipHistory?.map((o) => (
            <li key={o.id} className="rounded-md border border-slate-100 bg-white p-2">
              <span className="font-medium">
                {staffById.get(o.owner_user_id)?.full_name ?? o.owner_user_id}
              </span>
              <span className="text-xs text-slate-500">
                {" "}
                — from {new Date(o.started_at).toLocaleString()}
                {o.ended_at ? ` to ${new Date(o.ended_at).toLocaleString()}` : " (current)"}
              </span>
              {o.transfer_reason && (
                <p className="text-xs text-slate-500">Reason: {o.transfer_reason}</p>
              )}
            </li>
          ))}
          {ownershipHistory?.length === 0 && (
            <p className="text-sm text-slate-500">
              No owner yet — this case is unassigned.
            </p>
          )}
        </ol>
      </section>

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
