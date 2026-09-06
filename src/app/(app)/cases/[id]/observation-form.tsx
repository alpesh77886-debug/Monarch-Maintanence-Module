"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ObservationForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [observation, setObservation] = useState("");
  const [action, setAction] = useState("");
  const [currentCondition, setCurrentCondition] = useState("");
  const [nextStep, setNextStep] = useState("");
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
      observation: observation || null,
      action: action || null,
      current_condition: currentCondition || null,
      next_step: nextStep || null,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setObservation("");
    setAction("");
    setCurrentCondition("");
    setNextStep("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
      >
        + Add observation / action entry
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3"
    >
      <label className="text-sm text-slate-700">
        Observation
        <textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-slate-700">
        Action taken
        <textarea
          value={action}
          onChange={(e) => setAction(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-slate-700">
        Current condition
        <input
          value={currentCondition}
          onChange={(e) => setCurrentCondition(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-slate-700">
        Next step
        <input
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
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
          {submitting ? "Saving…" : "Save entry"}
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
