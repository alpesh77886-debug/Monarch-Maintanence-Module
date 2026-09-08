"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function InterventionForm({
  caseId,
  currentUserId,
}: {
  caseId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [observedSymptom, setObservedSymptom] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
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
      p_observed_symptom: observedSymptom || null,
      p_immediate_action: immediateAction || null,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setObservedSymptom("");
    setImmediateAction("");
    setActionTaken("");
    setResult("");
    setFailureMode("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        + Record intervention
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4 shadow-sm"
    >
      <label className="text-sm text-fg">
        Observed symptom
        <input
          value={observedSymptom}
          onChange={(e) => setObservedSymptom(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Immediate action / containment
        <input
          value={immediateAction}
          onChange={(e) => setImmediateAction(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Action taken
        <textarea
          required
          value={actionTaken}
          onChange={(e) => setActionTaken(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Result
        <input
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Failure mode (if identified)
        <input
          value={failureMode}
          onChange={(e) => setFailureMode(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save intervention"}
        </Button>
        <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
