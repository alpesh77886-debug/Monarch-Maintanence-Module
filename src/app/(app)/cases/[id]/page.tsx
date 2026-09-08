import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AcknowledgeForm from "./acknowledge-form";
import TakeOwnershipButton from "./take-ownership-button";
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
import ImpactPanel from "./impact-panel";
import RecurrenceCapaPanel from "./recurrence-capa-panel";
import PriorityPanel from "./priority-panel";
import PtwPanel from "./ptw-panel";
import RootCausePanel from "./root-cause-panel";
import EvidencePanel from "./evidence-panel";
import AssetPanel from "./asset-panel";
import RestorationHistoryPanel from "./restoration-history-panel";
import Link from "next/link";
import { Badge, Card, StatusBadge } from "@/components/ui";
import type {
  StaffMember,
  SafetyStop,
  ProductionBoundaryEvent,
  CaseImpactRecord,
  RecurrenceFlag,
  CapaLink,
  CaseRootCause,
  CaseEvidence,
  CaseAsset,
} from "@/lib/supabase/database.types";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Loop 37 (performance). This page needs ~22 independent reads. Each one
  // used to be its own `await`, so they ran strictly one after another —
  // ~22 sequential round trips to Supabase for a single page view, every one
  // of them paying full network latency. None of them depend on each other,
  // so they are issued together here and awaited once: ~22 sequential trips
  // become one parallel wave. Only the two genuinely dependent reads run
  // afterwards (the staff row needs `user.id`; the duplicate's case number
  // needs `caseRow`). No query, filter, or ordering changed — this is purely
  // *when* they are issued, so RLS and every derived flag below behave
  // exactly as before.
  const [
    {
      data: { user },
    },
    { data: caseRow },
    { data: events },
    { data: observations },
    { data: assignments },
    { data: interventions },
    { data: activeWait },
    { data: pendingRestoration },
    { data: restorationHistory },
    { data: pendingClearance },
    { data: spareRequests },
    { data: spareUsage },
    // §22.2 handover quality: a receiver must be able to see owner history and
    // escalation state, not just the current status — so both are surfaced on
    // the case itself rather than living only in the audit log.
    { data: ownershipHistory },
    { data: staffList },
    // §13 production restart boundary.
    { data: activeStop },
    { data: boundaryEvents },
    // §25.1 group 3 production impact. Every record is fetched, not just the
    // current one, because a correction supersedes rather than replaces (§27) —
    // the superseded figures stay visible.
    { data: impactRecords },
    // §18/§19. Flags are read for this case only; the scan links the related
    // cases inside the flag itself.
    { data: recurrenceFlags },
    { data: capaRows },
    // §9 item 6 / §9.1 — validated root cause. Every record fetched (not just
    // current) since a correction supersedes rather than replaces (§27).
    { data: rootCauseRecords },
    // §5.1 / §26 evidence. Any authenticated user may add it (not staff-only —
    // matches the reporter's own ability to report the case), so this fetch is
    // not gated behind isStaffRow like the others.
    { data: evidenceRecords },
    // §5.1 asset linkage. Staff-only, direct insert — the RLS/trigger do the
    // work; this is just a read for display.
    { data: caseAssets },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("cases").select("*").eq("id", id).single(),
    supabase.from("case_events").select("*").eq("case_id", id).order("occurred_at", { ascending: true }),
    supabase.from("observations").select("*").eq("case_id", id).order("created_at", { ascending: true }),
    supabase.from("case_assignments").select("*").eq("case_id", id).order("assigned_at", { ascending: true }),
    supabase.from("interventions").select("*").eq("case_id", id).order("started_at", { ascending: true }),
    supabase.from("waits").select("*").eq("case_id", id).is("resumed_at", null).maybeSingle(),
    supabase
      .from("restorations")
      .select("*")
      .eq("case_id", id)
      .eq("restoration_type", "TECHNICAL")
      .is("verification_result", null)
      .maybeSingle(),
    supabase.from("restorations").select("*").eq("case_id", id).order("recorded_at", { ascending: true }),
    supabase.from("clearances").select("*").eq("case_id", id).eq("decision", "PENDING").maybeSingle(),
    supabase.from("spare_requests").select("*").eq("case_id", id).order("requested_at", { ascending: true }),
    supabase.from("spare_usage").select("*").eq("case_id", id).order("used_at", { ascending: true }),
    supabase.from("case_ownership").select("*").eq("case_id", id).order("started_at", { ascending: true }),
    supabase.from("staff").select("id, full_name, role, is_active, is_available").eq("is_active", true),
    supabase.from("safety_stops").select("*").eq("case_id", id).is("lifted_at", null).maybeSingle(),
    supabase
      .from("production_boundary_events")
      .select("*")
      .eq("case_id", id)
      .order("recorded_at", { ascending: true }),
    supabase.from("case_impact_records").select("*").eq("case_id", id).order("recorded_at", { ascending: false }),
    supabase.from("recurrence_flags").select("*").eq("case_id", id).order("flagged_at", { ascending: false }),
    supabase.from("capa_links").select("*").eq("case_id", id).order("created_at", { ascending: true }),
    supabase.from("case_root_causes").select("*").eq("case_id", id).order("recorded_at", { ascending: false }),
    supabase.from("evidence").select("*").eq("case_id", id).order("created_at", { ascending: false }),
    supabase.from("case_assets").select("*").eq("case_id", id).order("linked_at", { ascending: true }),
  ]);

  if (!caseRow) {
    notFound();
  }

  // The only two reads that genuinely depend on results above — also issued
  // together rather than one after the other.
  const [{ data: isStaffRow }, { data: primaryCase }, { data: qcGrant }] = await Promise.all([
    supabase.from("staff").select("id, role").eq("id", user?.id ?? "").maybeSingle(),
    caseRow.duplicate_of_case_id
      ? supabase.from("cases").select("case_number").eq("id", caseRow.duplicate_of_case_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // F-01: does the viewer hold an active QC authority grant? This decides
    // only what the QC panel *shows* — qc_decision enforces the same rule
    // server-side regardless of what the UI renders.
    supabase
      .from("qc_authority")
      .select("user_id")
      .eq("user_id", user?.id ?? "")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const isQcAuthority = !!qcGrant;

  const duplicatePrimaryCaseNumber: string | null = primaryCase?.case_number ?? null;

  const staffById = new Map((staffList ?? []).map((s) => [s.id, s as StaffMember]));

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

  // TEMPORARILY_RESTORED has no direct edge to TECHNICALLY_RESTORED in the
  // locked lifecycle graph (only IN_REPAIR does) — see FollowUpButton.
  const canRecordRestoration = !!isStaffRow && caseRow.status === "IN_REPAIR";
  const needsFollowUp = !!isStaffRow && caseRow.status === "TEMPORARILY_RESTORED";

  // §6: reporter or staff may claim; only staff may confirm, and only once
  // claimed. Not offered once the case is CLOSED/REJECTED/DUPLICATE.
  const caseIsTerminal = ["CLOSED", "REJECTED", "DUPLICATE"].includes(caseRow.status);

  // §28 "Take Ownership" / §24 HUMAN REQUIRED "acknowledge/take ownership".
  const canTakeOwnership =
    !!isStaffRow && !caseRow.current_owner_user_id && !caseIsTerminal && !canAcknowledge;
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/cases" className="text-xs font-medium text-muted hover:text-fg">
          ← All cases
        </Link>
        <Card className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs text-muted">{caseRow.case_number}</p>
            <StatusBadge status={caseRow.status} />
            {caseRow.priority && <Badge tone="neutral">{caseRow.priority}</Badge>}
            {caseRow.major_complex_flag && <Badge tone="danger">MAJOR/COMPLEX</Badge>}
          </div>
          <h1 className="mt-2 text-lg font-semibold text-fg">{caseRow.symptom}</h1>
          <p className="mt-1 text-sm text-muted">
            {caseRow.case_type} · Status: <span className="font-medium">{caseRow.status}</span>
            {caseRow.priority ? ` · Priority: ${caseRow.priority}` : ""}
          </p>
          {caseRow.duplicate_of_case_id && (
            <p className="mt-2 text-sm text-muted">
              Duplicate of{" "}
              {duplicatePrimaryCaseNumber ? (
                <Link
                  href={`/cases/${caseRow.duplicate_of_case_id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {duplicatePrimaryCaseNumber}
                </Link>
              ) : (
                caseRow.duplicate_of_case_id
              )}
            </p>
          )}
        </Card>
      </div>

      {/* §5.1: any signed-in user may attach evidence, not staff-only — the
          reporter needs this as much as staff do. */}
      {!!user && (
        <EvidencePanel
          caseId={caseRow.id}
          records={(evidenceRecords ?? []) as CaseEvidence[]}
          nameById={Object.fromEntries(
            Array.from(staffById.entries()).map(([sid, s]) => [sid, s.full_name])
          )}
        />
      )}

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

      {/* Loop 39 (RISK-27): acknowledging assigns ownership, so a REPORTED
          case never needed this. A case that LOSES its owner later did —
          §22.1's shift-end handover sets the owner to NULL by design when
          nobody is available, and the dashboard lists exactly those cases as
          needing an owner. Offered only when Acknowledge is not, so there are
          never two buttons doing the same thing. */}
      {canTakeOwnership && <TakeOwnershipButton caseId={caseRow.id} />}

      {isStaffRow && caseRow.current_owner_user_id && (
        <ObservationForm caseId={caseRow.id} interventions={interventions ?? []} />
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

      {isStaffRow && <RestorationHistoryPanel restorations={restorationHistory ?? []} />}

      <SparesPanel
        caseId={caseRow.id}
        spareRequests={spareRequests ?? []}
        spareUsage={spareUsage ?? []}
        canRaise={canRaiseSpareRequest}
        canRecordUsage={canRecordSpareUsage}
        isManager={isManager}
        isStaff={!!isStaffRow}
      />

      {isStaffRow && (
        <QcPanel
          caseId={caseRow.id}
          status={caseRow.status}
          qcRequired={caseRow.qc_required}
          pendingClearance={pendingClearance ?? null}
          isQcAuthority={isQcAuthority}
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

      {isStaffRow && (
        <PriorityPanel
          caseId={caseRow.id}
          priority={caseRow.priority}
          priorityLockedByManager={caseRow.priority_set_by_role === "MAINTENANCE_MANAGER"}
          isManager={isManager}
        />
      )}

      {isStaffRow && (
        <PtwPanel
          caseId={caseRow.id}
          status={caseRow.status}
          ptwRequired={caseRow.ptw_required}
          ptwProofRef={caseRow.ptw_proof_ref}
        />
      )}

      {isStaffRow && (
        <AssetPanel
          caseId={caseRow.id}
          assets={(caseAssets ?? []) as CaseAsset[]}
        />
      )}

      {isStaffRow && (
        <RootCausePanel
          caseId={caseRow.id}
          records={(rootCauseRecords ?? []) as CaseRootCause[]}
          nameById={Object.fromEntries(
            Array.from(staffById.entries()).map(([sid, s]) => [sid, s.full_name])
          )}
        />
      )}

      {isStaffRow && (
        <ImpactPanel
          caseId={caseRow.id}
          records={(impactRecords ?? []) as CaseImpactRecord[]}
          nameById={Object.fromEntries(
            Array.from(staffById.entries()).map(([sid, s]) => [sid, s.full_name])
          )}
        />
      )}

      {isStaffRow && (
        <RecurrenceCapaPanel
          caseId={caseRow.id}
          flags={(recurrenceFlags ?? []) as RecurrenceFlag[]}
          capas={(capaRows ?? []) as CapaLink[]}
          staff={(staffList ?? []) as StaffMember[]}
          isManager={isManager}
          nameById={Object.fromEntries(
            Array.from(staffById.entries()).map(([sid, s]) => [sid, s.full_name])
          )}
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
        <section className="rounded-xl border border-bad/25 bg-bad/10 p-4">
          <h2 className="text-sm font-semibold text-red-300">Escalation state</h2>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-red-300">
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

      <Card>
        <h2 className="text-sm font-semibold text-fg">Ownership history</h2>
        <ol className="mt-2 flex flex-col gap-1.5 text-sm text-fg">
          {ownershipHistory?.map((o) => (
            <li key={o.id} className="rounded-lg border border-line bg-bg2 p-2.5">
              <span className="font-medium">
                {staffById.get(o.owner_user_id)?.full_name ?? o.owner_user_id}
              </span>
              <span className="text-xs text-muted">
                {" "}
                — from {new Date(o.started_at).toLocaleString()}
                {o.ended_at ? ` to ${new Date(o.ended_at).toLocaleString()}` : " (current)"}
              </span>
              {o.transfer_reason && (
                <p className="text-xs text-muted">Reason: {o.transfer_reason}</p>
              )}
            </li>
          ))}
          {ownershipHistory?.length === 0 && (
            <p className="text-sm text-muted">
              No owner yet — this case is unassigned.
            </p>
          )}
        </ol>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-fg">Assigned technicians</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-fg">
          {assignments?.map((a) => (
            <li key={a.id}>
              {a.technician_user_id}
              {a.emergency_direct_start ? " (emergency direct start)" : ""}
              {!a.is_active ? " — inactive" : ""}
            </li>
          ))}
          {assignments?.length === 0 && (
            <p className="text-sm text-muted">No technicians assigned yet.</p>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-fg">Interventions</h2>
        <ol className="mt-2 flex flex-col gap-2">
          {interventions?.map((i) => (
            <li key={i.id} className="rounded-lg border border-line bg-bg2 p-2.5 text-sm">
              <p className="text-xs text-muted2">{new Date(i.started_at).toLocaleString()}</p>
              <p><span className="font-medium">Action:</span> {i.action_taken}</p>
              {i.result && <p><span className="font-medium">Result:</span> {i.result}</p>}
              {i.failure_mode && (
                <p><span className="font-medium">Failure mode:</span> {i.failure_mode}</p>
              )}
            </li>
          ))}
          {interventions?.length === 0 && (
            <p className="text-sm text-muted">No interventions recorded yet.</p>
          )}
        </ol>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-fg">
          Observation + Action Continuity Journal
        </h2>
        <ol className="mt-2 flex flex-col gap-2">
          {observations?.map((o) => {
            const linkedIntervention = interventions?.find((i) => i.id === o.intervention_id);
            return (
              <li key={o.id} className="rounded-lg border border-line bg-bg2 p-2.5 text-sm">
                <p className="text-xs text-muted2">
                  {new Date(o.created_at).toLocaleString()}
                </p>
                {linkedIntervention && (
                  <p className="text-xs text-muted">
                    <span className="font-medium">Intervention:</span> {linkedIntervention.action_taken}
                  </p>
                )}
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
                {o.evidence_ref && (
                  <p><span className="font-medium">Evidence:</span> {o.evidence_ref}</p>
                )}
              </li>
            );
          })}
          {observations?.length === 0 && (
            <p className="text-sm text-muted">No journal entries yet.</p>
          )}
        </ol>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-fg">Audit trail</h2>
        <ol className="mt-2 flex flex-col gap-1 text-xs text-muted">
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
      </Card>
    </div>
  );
}
