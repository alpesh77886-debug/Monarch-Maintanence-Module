"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RestorationDispute } from "@/lib/supabase/database.types";
import { formatIst } from "@/lib/format";
import { Button } from "@/components/ui";

// RISK-33 (§11, Gate 21 Loop 104): the Executive/staff side. Only rendered
// when page.tsx's canAcknowledgeDispute is true (viewer is staff and a
// PENDING dispute exists) — acknowledge_restoration_dispute re-checks
// is_staff() and the dispute's PENDING status server-side regardless.
export default function AcknowledgeDisputeCard({ dispute }: { dispute: RestorationDispute }) {
  const router = useRouter();
  const [resolving, setResolving] = useState<"FIXED" | "NOT_FIXED" | null>(null);
  const [reason, setReason] = useState("");
  const [returnStatus, setReturnStatus] = useState<"DIAGNOSING" | "IN_REPAIR">("IN_REPAIR");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("acknowledge_restoration_dispute", {
      p_dispute_id: dispute.id,
      p_fixed: resolving === "FIXED",
      p_reason: reason,
      ...(resolving === "NOT_FIXED" ? { p_return_status: returnStatus } : {}),
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warn/25 bg-warn/10 p-3">
      <p className="text-sm font-medium text-amber-300">
        Complainant disputes this restoration (§11) — record your decision
      </p>
      <p className="text-sm text-amber-300">{dispute.raised_reason}</p>
      <p className="text-xs text-muted2">{formatIst(dispute.raised_at)}</p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {!resolving ? (
        <div className="flex gap-2">
          <Button variant="success" onClick={() => setResolving("FIXED")}>
            Confirmed fixed
          </Button>
          <Button variant="secondary" onClick={() => setResolving("NOT_FIXED")}>
            Confirmed not fixed
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label className="text-sm text-amber-300">
            Reason (required)
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-warn/25 px-3 py-2 text-base"
            />
          </label>
          {resolving === "NOT_FIXED" && (
            <label className="text-sm text-amber-300">
              Return to
              <select
                value={returnStatus}
                onChange={(e) => setReturnStatus(e.target.value as "DIAGNOSING" | "IN_REPAIR")}
                className="mt-1 block w-full rounded-lg border border-warn/25 px-3 py-2 text-base"
              >
                <option value="IN_REPAIR">IN_REPAIR</option>
                <option value="DIAGNOSING">DIAGNOSING</option>
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Confirm decision"}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setResolving(null)}>
              Back
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
