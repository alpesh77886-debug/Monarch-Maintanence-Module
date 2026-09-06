"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function InterventionForm({
  caseId,
  currentUserId,
}: {
  caseId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actionTaken, setActionTaken] = useState("");
  const [result, setResult] = useState("");
  const [failureMode, setFailureMode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("record_intervention", {
      p_case_id: caseId,
      p_action_taken: actionTaken,
      p_result: result || null,
      p_failure_mode: failureMode || null,
      p_technician_user_id: currentUserId,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setActionTaken("");
    setResult("");
    setFailureMode("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
      >
        + Record intervention
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3"
    >
      <label className="text-sm text-slate-700">
        Action taken
        <textarea
          required
          value={actionTaken}
          onChange={(e) => setActionTaken(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-slate-700">
        Result
        <input
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-slate-700">
        Failure mode (if identified)
        <input
          value={failureMode}
          onChange={(e) => setFailureMode(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save intervention"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
