"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// §6: emergency is TWO-STEP — reporter/staff claim, then Executive/Manager
// confirm. Only confirm_emergency starts the 1h clock (§7.3); there is no
// single toggle here that can skip a step.
export default function EmergencyPanel({
  caseId,
  emergencyClaimed,
  emergencyClaimReason,
  emergencyConfirmed,
  emergencyConfirmedAt,
  canClaim,
  canConfirm,
}: {
  caseId: string;
  emergencyClaimed: boolean;
  emergencyClaimReason: string | null;
  emergencyConfirmed: boolean;
  emergencyConfirmedAt: string | null;
  canClaim: boolean;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function claim() {
    setError(null);
    if (!reason.trim()) {
      setError("A reason/evidence is required to claim Emergency/Safety-Critical.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("claim_emergency", {
      p_case_id: caseId,
      p_reason: reason,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  async function confirm() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("confirm_emergency", { p_case_id: caseId });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  if (emergencyConfirmed) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3">
        <p className="text-sm font-semibold text-red-900">
          Confirmed Emergency / Safety-Critical
        </p>
        <p className="text-xs text-red-800">
          Confirmed at{" "}
          {emergencyConfirmedAt ? new Date(emergencyConfirmedAt).toLocaleString() : "—"} — 1h
          escalation clock is running.
        </p>
        {emergencyClaimReason && (
          <p className="mt-1 text-xs text-red-800">Claim reason: {emergencyClaimReason}</p>
        )}
      </div>
    );
  }

  if (emergencyClaimed) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-orange-300 bg-orange-50 p-3">
        <p className="text-sm font-semibold text-orange-900">
          Emergency/Safety-Critical claimed — awaiting Executive/Manager confirmation
        </p>
        <p className="text-xs text-orange-800">{emergencyClaimReason}</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {canConfirm && (
          <button
            onClick={confirm}
            disabled={submitting}
            className="self-start rounded-md bg-orange-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Confirm Emergency (starts 1h escalation clock)
          </button>
        )}
      </div>
    );
  }

  if (!canClaim) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-900">Claim Emergency / Safety-Critical</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason/evidence for the emergency claim"
        className="rounded-md border border-slate-300 p-2 text-sm"
        rows={2}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        onClick={claim}
        disabled={submitting}
        className="self-start rounded-md border border-red-700 px-3 py-2 text-sm text-red-800 disabled:opacity-50"
      >
        Claim Emergency
      </button>
    </div>
  );
}
