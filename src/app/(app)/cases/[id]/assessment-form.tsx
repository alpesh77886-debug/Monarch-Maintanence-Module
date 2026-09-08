"use client";

// Blueprint Gap Matrix G1 (Loop 54): the locked ACKNOWLEDGED -> ASSESSED
// transition (IMPLEMENTATION_PACK.md §4, status_transitions) had no UI
// trigger anywhere in the app. Fixed by adding this step rather than by
// silently loosening assign_technician's auto-advance guard — matches the
// Boss's explicit choice of a dedicated Assessment step over an inline
// auto-advance.
//
// Deliberately reuses the existing generic transition_case RPC rather than
// introducing a new one: ACKNOWLEDGED -> ASSESSED does not require a
// mandatory reason (only REJECTED/DUPLICATE/CLOSED do, per transition_case's
// own guard in 0003), and the assessment notes fit naturally into the
// existing p_reason parameter, which is already recorded on both
// case_events and audit_log. No new backend surface, no new migration.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function AssessmentForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "ASSESSED",
      p_reason: notes || null,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-brand/25 bg-brand/10 p-4"
    >
      <p className="text-sm font-medium text-sky-300">Confirm assessment</p>
      <label className="text-sm text-sky-300">
        Assessment notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-lg border border-brand/25 px-3 py-2 text-base"
        />
      </label>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Confirming…" : "Confirm Assessment"}
      </Button>
    </form>
  );
}
