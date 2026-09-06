"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Clearance } from "@/lib/supabase/database.types";

export default function QcPanel({
  caseId,
  status,
  qcRequired,
  pendingClearance,
}: {
  caseId: string;
  status: string;
  qcRequired: boolean | null;
  pendingClearance: Clearance | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function setQcRequired(value: boolean) {
    const why = window.prompt(`Reason for setting QC required = ${value}?`);
    if (!why) return;
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_qc_required", {
      p_case_id: caseId,
      p_qc_required: value,
      p_reason: why,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function sendToQc() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("send_to_qc", { p_case_id: caseId });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function decide(decision: "CLEARED" | "REJECTED") {
    if (!pendingClearance) return;
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("qc_decision", {
      p_clearance_id: pendingClearance.id,
      p_decision: decision,
      p_reason: decision === "REJECTED" ? reason : null,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    setReason("");
    setRejecting(false);
    router.refresh();
  }

  if (pendingClearance) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
        <p className="text-sm font-medium text-indigo-900">
          Sent to QC {new Date(pendingClearance.sent_to_qc_at).toLocaleString()} — awaiting decision
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!rejecting ? (
          <div className="flex gap-2">
            <button
              onClick={() => decide("CLEARED")}
              disabled={submitting}
              className="rounded-md bg-indigo-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              QC cleared
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={submitting}
              className="rounded-md border border-indigo-700 px-3 py-2 text-sm text-indigo-900"
            >
              QC rejected
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rejection reason (required)"
              rows={2}
              className="rounded-md border border-indigo-300 px-3 py-2 text-base"
            />
            <div className="flex gap-2">
              <button
                onClick={() => decide("REJECTED")}
                disabled={submitting || !reason.trim()}
                className="rounded-md bg-indigo-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirm rejection
              </button>
              <button
                onClick={() => setRejecting(false)}
                className="rounded-md border border-indigo-300 px-3 py-2 text-sm text-indigo-900"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === "TECHNICALLY_RESTORED") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-sm text-slate-700">
          QC required: <span className="font-medium">{qcRequired === null ? "not set" : String(qcRequired)}</span>
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setQcRequired(true)}
            disabled={submitting}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            Set QC required = Yes
          </button>
          <button
            onClick={() => setQcRequired(false)}
            disabled={submitting}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            Set QC required = No
          </button>
          {qcRequired && (
            <button
              onClick={sendToQc}
              disabled={submitting}
              className="rounded-md bg-indigo-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send to QC
            </button>
          )}
          {qcRequired === false && (
            <button
              onClick={async () => {
                setSubmitting(true);
                const supabase = createClient();
                const { error } = await supabase.rpc("transition_case", {
                  p_case_id: caseId,
                  p_new_status: "MAINTENANCE_RELEASED",
                });
                setSubmitting(false);
                if (error) return setError(error.message);
                router.refresh();
              }}
              disabled={submitting}
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Release (no QC needed)
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
