"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Restoration } from "@/lib/supabase/database.types";

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
    <div className="flex flex-col gap-3 rounded-lg border border-purple-200 bg-purple-50 p-3">
      <p className="text-sm font-medium text-purple-900">
        Technical restoration pending verification
      </p>
      <p className="text-sm text-purple-900">{restoration.details}</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!failing ? (
        <div className="flex gap-2">
          <button
            onClick={pass}
            disabled={submitting}
            className="rounded-md bg-purple-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Verified — passed
          </button>
          <button
            onClick={() => setFailing(true)}
            disabled={submitting}
            className="rounded-md border border-purple-700 px-3 py-2 text-sm text-purple-900"
          >
            Verification failed
          </button>
        </div>
      ) : (
        <form onSubmit={fail} className="flex flex-col gap-2">
          <label className="text-sm text-purple-900">
            Failure reason (required)
            <textarea
              required
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-purple-300 px-3 py-2 text-base"
            />
          </label>
          <label className="text-sm text-purple-900">
            Return to
            <select
              value={returnStatus}
              onChange={(e) => setReturnStatus(e.target.value as "DIAGNOSING" | "IN_REPAIR")}
              className="mt-1 block w-full rounded-md border border-purple-300 px-3 py-2 text-base"
            >
              <option value="IN_REPAIR">IN_REPAIR</option>
              <option value="DIAGNOSING">DIAGNOSING</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-purple-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Confirm failure"}
            </button>
            <button
              type="button"
              onClick={() => setFailing(false)}
              className="rounded-md border border-purple-300 px-3 py-2 text-sm text-purple-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
