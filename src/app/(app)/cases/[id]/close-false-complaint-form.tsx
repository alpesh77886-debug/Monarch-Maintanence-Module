"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// §4.7: the reporting person (not staff) may close a false/wrong complaint
// with a predefined closure reason, OTHER + explanation where applicable.
// The reason list below is UI convenience, not a locked business taxonomy —
// see close_false_complaint (0011) for what's actually enforced server-side
// (a non-empty reason, and a mandatory explanation when it's OTHER).
const PREDEFINED_REASONS = [
  { value: "MISTAKEN_REPORT", label: "Reported by mistake" },
  { value: "RESOLVED_BEFORE_ACKNOWLEDGEMENT", label: "Resolved itself before anyone picked it up" },
  { value: "DUPLICATE_OF_MY_OWN_REPORT", label: "I already reported this separately" },
  { value: "OTHER", label: "Other" },
];

export default function CloseFalseComplaintForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState(PREDEFINED_REASONS[0].value);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (reason === "OTHER" && !explanation.trim()) {
      setError("An explanation is required when the reason is Other.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("close_false_complaint", {
      p_case_id: caseId,
      p_closure_reason: reason,
      p_other_explanation: reason === "OTHER" ? explanation : null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-medium text-slate-900">This wasn&apos;t a real issue?</p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="rounded-md border border-slate-300 p-2 text-sm"
      >
        {PREDEFINED_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {reason === "OTHER" && (
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Explain why"
          className="rounded-md border border-slate-300 p-2 text-sm"
          rows={2}
        />
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting}
        className="self-start rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-800 disabled:opacity-50"
      >
        Close as false/wrong complaint
      </button>
    </div>
  );
}
