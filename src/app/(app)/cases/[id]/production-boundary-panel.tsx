"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SafetyStop, ProductionBoundaryEvent } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

// §13 production restart boundary. Nothing in this panel authorises or blocks
// a line start — Maintenance must not become Production's line-start
// authority (§13). It raises/lifts the Maintenance-side stop, and records
// what Maintenance observed at the boundary.
//
// §13.1 is explicit that recording a violation must NOT clear the stop, so
// there is deliberately no "record and lift" shortcut here: lifting is always
// its own action with its own reason.
export default function ProductionBoundaryPanel({
  caseId,
  status,
  activeStop,
  boundaryEvents,
}: {
  caseId: string;
  status: string;
  activeStop: SafetyStop | null;
  boundaryEvents: ProductionBoundaryEvent[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [stopType, setStopType] = useState<"SAFETY" | "TECHNICAL">("SAFETY");
  const [stopReason, setStopReason] = useState("");
  const [machineRef, setMachineRef] = useState("");
  const [lineRef, setLineRef] = useState("");
  const [liftReason, setLiftReason] = useState("");
  const [breachReason, setBreachReason] = useState("");
  const [notRestartedReason, setNotRestartedReason] = useState("");

  const released = status === "MAINTENANCE_RELEASED" || status === "CLOSED";

  async function call(name: string, args: Record<string, unknown>, clear: () => void) {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc(name, args);
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    clear();
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        Production restart boundary
      </h2>

      {activeStop ? (
        <div className="flex flex-col gap-2 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-900">
            {activeStop.stop_type} STOP ACTIVE
          </p>
          <p className="text-sm text-red-900">{activeStop.reason}</p>
          <p className="text-xs text-red-800">
            Raised {new Date(activeStop.raised_at).toLocaleString()}
            {activeStop.machine_ref ? ` · ${activeStop.machine_ref}` : ""}
            {activeStop.line_ref ? ` · ${activeStop.line_ref}` : ""}
          </p>
          <input
            value={liftReason}
            onChange={(e) => setLiftReason(e.target.value)}
            placeholder="Reason for lifting the stop"
            className="rounded-md border border-red-300 p-2 text-sm"
          />
          <Button
            variant="danger"
            className="self-start"
            onClick={() =>
              call(
                "lift_safety_stop",
                { p_safety_stop_id: activeStop.id, p_reason: liftReason },
                () => setLiftReason("")
              )
            }
            disabled={submitting || !liftReason.trim()}
          >
            Lift stop
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-slate-100 p-2">
          <p className="text-xs font-medium text-slate-700">
            Raise a Maintenance safety / technical stop
          </p>
          <div className="flex gap-2">
            <select
              value={stopType}
              onChange={(e) => setStopType(e.target.value as "SAFETY" | "TECHNICAL")}
              className="rounded-md border border-slate-300 p-2 text-sm"
            >
              <option value="SAFETY">Safety</option>
              <option value="TECHNICAL">Technical</option>
            </select>
            <input
              value={machineRef}
              onChange={(e) => setMachineRef(e.target.value)}
              placeholder="Machine ref"
              className="w-32 rounded-md border border-slate-300 p-2 text-sm"
            />
            <input
              value={lineRef}
              onChange={(e) => setLineRef(e.target.value)}
              placeholder="Line ref"
              className="w-28 rounded-md border border-slate-300 p-2 text-sm"
            />
          </div>
          <input
            value={stopReason}
            onChange={(e) => setStopReason(e.target.value)}
            placeholder="Reason for the stop"
            className="rounded-md border border-slate-300 p-2 text-sm"
          />
          <Button
            variant="danger"
            className="self-start"
            onClick={() =>
              call(
                "raise_safety_stop",
                {
                  p_case_id: caseId,
                  p_stop_type: stopType,
                  p_reason: stopReason,
                  p_machine_ref: machineRef || null,
                  p_line_ref: lineRef || null,
                },
                () => {
                  setStopReason("");
                  setMachineRef("");
                  setLineRef("");
                }
              )
            }
            disabled={submitting || !stopReason.trim()}
          >
            Raise stop
          </Button>
        </div>
      )}

      {!released && (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-700">
            Record: production started without Maintenance release (§13.1)
          </p>
          <p className="text-xs text-slate-500">
            This records what happened. It does not clear the stop and is not a
            successful-restart event.
          </p>
          <input
            value={breachReason}
            onChange={(e) => setBreachReason(e.target.value)}
            placeholder="Context — who started it, what was observed"
            className="rounded-md border border-slate-300 p-2 text-sm"
          />
          <Button
            variant="warning"
            className="self-start"
            onClick={() =>
              call(
                "record_production_started_without_release",
                {
                  p_case_id: caseId,
                  p_reason: breachReason,
                  p_machine_ref: activeStop?.machine_ref ?? machineRef ?? null,
                  p_line_ref: activeStop?.line_ref ?? lineRef ?? null,
                },
                () => setBreachReason("")
              )
            }
            disabled={submitting || !breachReason.trim()}
          >
            Record breach
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-medium text-slate-700">
          Record: shift ended, production not restarted (§13.2)
        </p>
        <input
          value={notRestartedReason}
          onChange={(e) => setNotRestartedReason(e.target.value)}
          placeholder="Context — why it did not restart"
          className="rounded-md border border-slate-300 p-2 text-sm"
        />
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            call(
              "record_production_not_restarted",
              { p_case_id: caseId, p_reason: notRestartedReason },
              () => setNotRestartedReason("")
            )
          }
          disabled={submitting || !notRestartedReason.trim()}
        >
          Record not restarted
        </Button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {boundaryEvents.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-slate-100 pt-3">
          {boundaryEvents.map((e) => (
            <li key={e.id} className="rounded-md border border-slate-100 p-2 text-sm">
              <p
                className={
                  e.event_type === "PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE"
                    ? "font-medium text-red-800"
                    : "font-medium text-slate-800"
                }
              >
                {e.event_type === "PRODUCTION_STARTED_WITHOUT_MAINTENANCE_RELEASE"
                  ? "Production started WITHOUT Maintenance release"
                  : "Production not restarted"}
              </p>
              <p className="text-xs text-slate-600">{e.reason}</p>
              <p className="text-xs text-slate-400">
                {new Date(e.recorded_at).toLocaleString()} · case was{" "}
                {e.case_status_at_record}
                {e.machine_ref ? ` · ${e.machine_ref}` : ""}
                {e.line_ref ? ` · ${e.line_ref}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
