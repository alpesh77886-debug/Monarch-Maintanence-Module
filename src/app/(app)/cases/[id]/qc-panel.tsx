"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Clearance } from "@/lib/supabase/database.types";
import { Button, FormField } from "@/components/ui";
import { formatIst } from "@/lib/format";

export default function QcPanel({
  caseId,
  status,
  qcRequired,
  pendingClearance,
  isQcAuthority,
}: {
  caseId: string;
  status: string;
  qcRequired: boolean | null;
  pendingClearance: Clearance | null;
  // F-01: holds an active maintenance.qc_authority grant. Never true by
  // virtue of a Maintenance role — the server RPC enforces the same rule, so
  // this only decides what is *shown*, never what is *allowed*.
  isQcAuthority: boolean;
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
    // F-01: Maintenance may send a case to QC but must never decide it —
    // §1 and §43.8 put QC clearance truth outside Maintenance's ownership.
    // A Maintenance user is told what is happening and who owns the next
    // step, rather than being shown buttons the server will refuse.
    if (!isQcAuthority) {
      return (
        <div className="flex flex-col gap-1 rounded-lg border border-brand/30 bg-brand/10 p-3">
          <p className="text-sm font-medium text-brand">
            Sent to QC {formatIst(pendingClearance.sent_to_qc_at)} — awaiting QC decision
          </p>
          <p className="text-xs text-brand">
            QC clearance is decided by QC, not by Maintenance. This case stays in
            CLEARANCE_PENDING until an identity holding QC authority clears or
            rejects it.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 rounded-lg border border-brand/30 bg-brand/10 p-3">
        <p className="text-sm font-medium text-brand">
          Sent to QC {formatIst(pendingClearance.sent_to_qc_at)} — awaiting decision
        </p>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {!rejecting ? (
          <div className="flex gap-2">
            <Button onClick={() => decide("CLEARED")} disabled={submitting}>
              QC cleared
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(true)} disabled={submitting}>
              QC rejected
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <FormField label="Rejection reason" required labelClassName="text-brand">
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-brand/40 px-3 py-2 text-base"
              />
            </FormField>
            <div className="flex gap-2">
              <Button onClick={() => decide("REJECTED")} disabled={submitting || !reason.trim()}>
                Confirm rejection
              </Button>
              <Button variant="secondary" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === "TECHNICALLY_RESTORED") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3">
        <p className="text-sm text-fg">
          QC required: <span className="font-medium">{qcRequired === null ? "not set" : String(qcRequired)}</span>
        </p>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setQcRequired(true)} disabled={submitting}>
            Set QC required = Yes
          </Button>
          <Button variant="secondary" onClick={() => setQcRequired(false)} disabled={submitting}>
            Set QC required = No
          </Button>
          {qcRequired && (
            <Button onClick={sendToQc} disabled={submitting}>
              Send to QC
            </Button>
          )}
          {qcRequired === false && (
            <Button
              variant="success"
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
            >
              Release (no QC needed)
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
