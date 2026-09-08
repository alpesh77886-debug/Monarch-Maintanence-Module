"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Restoration } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

export default function VerifyRestorationCard({ restoration }: { restoration: Restoration }) {
  const router = useRouter();
  const [failing, setFailing] = useState(false);
  const [failureReason, setFailureReason] = useState("");
  const [returnStatus, setReturnStatus] = useState<"DIAGNOSING" | "IN_REPAIR">("IN_REPAIR");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pass() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("verify_restoration", {
      p_restoration_id: restoration.id,
      p_passed: true,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function fail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("verify_restoration", {
      p_restoration_id: restoration.id,
      p_passed: false,
      p_failure_reason: failureReason,
      p_return_status: returnStatus,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-vio/25 bg-vio/10 p-3">
      <p className="text-sm font-medium text-purple-300">
        Technical restoration pending verification
      </p>
      <p className="text-sm text-purple-300">{restoration.details}</p>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!failing ? (
        <div className="flex gap-2">
          <Button variant="success" onClick={pass} disabled={submitting}>
            Verified — passed
          </Button>
          <Button variant="secondary" onClick={() => setFailing(true)} disabled={submitting}>
            Verification failed
          </Button>
        </div>
      ) : (
        <form onSubmit={fail} className="flex flex-col gap-2">
          <label className="text-sm text-purple-300">
            Failure reason (required)
            <textarea
              required
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-vio/25 px-3 py-2 text-base"
            />
          </label>
          <label className="text-sm text-purple-300">
            Return to
            <select
              value={returnStatus}
              onChange={(e) => setReturnStatus(e.target.value as "DIAGNOSING" | "IN_REPAIR")}
              className="mt-1 block w-full rounded-lg border border-vio/25 px-3 py-2 text-base"
            >
              <option value="IN_REPAIR">IN_REPAIR</option>
              <option value="DIAGNOSING">DIAGNOSING</option>
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Confirm failure"}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setFailing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
