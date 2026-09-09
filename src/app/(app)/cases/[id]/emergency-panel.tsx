"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, FormField } from "@/components/ui";
import { formatIst } from "@/lib/format";

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
      <div className="rounded-lg border border-bad/25 bg-bad/10 p-3">
        <p className="text-sm font-semibold text-red-300">
          Confirmed Emergency / Safety-Critical
        </p>
        <p className="text-xs text-red-300">
          Confirmed at{" "}
          {emergencyConfirmedAt ? formatIst(emergencyConfirmedAt) : "—"} — 1h
          escalation clock is running.
        </p>
        {emergencyClaimReason && (
          <p className="mt-1 text-xs text-red-300">Claim reason: {emergencyClaimReason}</p>
        )}
      </div>
    );
  }

  if (emergencyClaimed) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-orange/25 bg-orange/10 p-3">
        <p className="text-sm font-semibold text-orange-300">
          Emergency/Safety-Critical claimed — awaiting Executive/Manager confirmation
        </p>
        <p className="text-xs text-orange-300">{emergencyClaimReason}</p>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {canConfirm && (
          <Button variant="warning" className="self-start" onClick={confirm} disabled={submitting}>
            Confirm Emergency (starts 1h escalation clock)
          </Button>
        )}
      </div>
    );
  }

  if (!canClaim) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3">
      <p className="text-sm font-medium text-fg">Claim Emergency / Safety-Critical</p>
      <FormField label="Reason / evidence" required>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-line2 p-2 text-sm"
          rows={2}
        />
      </FormField>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button variant="danger" className="self-start" onClick={claim} disabled={submitting}>
        Claim Emergency
      </Button>
    </div>
  );
}
