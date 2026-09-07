"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

// §4.6: duplicate case handling — links to a primary case, primary is left
// untouched, actor/time/reason recorded. See mark_duplicate_case (0011).
export default function MarkDuplicateForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [primaryCaseNumber, setPrimaryCaseNumber] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();

    const { data: primary, error: lookupErr } = await supabase
      .from("cases")
      .select("id")
      .eq("case_number", primaryCaseNumber.trim())
      .maybeSingle();
    if (lookupErr || !primary) {
      setSubmitting(false);
      setError(`Primary case "${primaryCaseNumber}" not found.`);
      return;
    }

    const { error } = await supabase.rpc("mark_duplicate_case", {
      p_case_id: caseId,
      p_primary_case_id: primary.id,
      p_reason: reason,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-900">Mark as duplicate</p>
      <input
        value={primaryCaseNumber}
        onChange={(e) => setPrimaryCaseNumber(e.target.value)}
        placeholder="Primary case number (e.g. MC-000123)"
        className="rounded-md border border-slate-300 p-2 text-sm"
      />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        className="rounded-md border border-slate-300 p-2 text-sm"
        rows={2}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button
        variant="secondary"
        className="self-start"
        onClick={submit}
        disabled={submitting || !primaryCaseNumber.trim()}
      >
        Mark duplicate
      </Button>
    </div>
  );
}
