"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Intervention } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

// §8: "Each entry records ... intervention/step reference ... observation
// ... action ... result ... current condition ... pending next action ...
// blocker/dependency ... evidence/reference where applicable." All 9 fields
// map 1:1 to columns that have existed on maintenance.observations since
// Loop 1 — this form previously only exposed 4 of them (observation,
// action, current_condition, next_step), so result/pending_action/blocker/
// intervention_id/evidence_ref were silently unreachable through the app.
export default function ObservationForm({
  caseId,
  interventions,
}: {
  caseId: string;
  interventions: Intervention[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [interventionId, setInterventionId] = useState("");
  const [observation, setObservation] = useState("");
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");
  const [currentCondition, setCurrentCondition] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [blocker, setBlocker] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not signed in.");
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("observations").insert({
      case_id: caseId,
      actor_user_id: user.id,
      intervention_id: interventionId || null,
      observation: observation || null,
      action: action || null,
      result: result || null,
      current_condition: currentCondition || null,
      pending_action: pendingAction || null,
      blocker: blocker || null,
      next_step: nextStep || null,
      evidence_ref: evidenceRef || null,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setInterventionId("");
    setObservation("");
    setAction("");
    setResult("");
    setCurrentCondition("");
    setPendingAction("");
    setBlocker("");
    setNextStep("");
    setEvidenceRef("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        + Add observation / action entry
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4 shadow-sm"
    >
      {interventions.length > 0 && (
        <label className="text-sm text-fg">
          Related intervention (optional)
          <select
            value={interventionId}
            onChange={(e) => setInterventionId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
          >
            <option value="">(not linked to a specific intervention)</option>
            {interventions.map((i) => (
              <option key={i.id} value={i.id}>
                {new Date(i.started_at).toLocaleString()} — {i.action_taken}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm text-fg">
        Observation
        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Action taken
        <textarea
          value={action}
          onChange={(e) => setAction(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Result
        <textarea
          value={result}
          onChange={(e) => setResult(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Current condition
        <input
          value={currentCondition}
          onChange={(e) => setCurrentCondition(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Pending action
        <input
          value={pendingAction}
          onChange={(e) => setPendingAction(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Blocker
        <input
          value={blocker}
          onChange={(e) => setBlocker(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Next step
        <input
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-fg">
        Evidence reference (optional)
        <input
          value={evidenceRef}
          onChange={(e) => setEvidenceRef(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
        />
      </label>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save entry"}
        </Button>
        <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
