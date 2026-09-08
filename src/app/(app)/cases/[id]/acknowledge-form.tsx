"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Priority } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

export default function AcknowledgeForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [assessment, setAssessment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("acknowledge_case", {
      p_case_id: caseId,
      p_priority: priority,
      p_initial_assessment: assessment || null,
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
      <p className="text-sm font-medium text-sky-300">Acknowledge this case</p>
      <label className="text-sm text-sky-300">
        Priority
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="mt-1 block w-full rounded-lg border border-brand/25 px-3 py-2 text-base"
        >
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
        </select>
      </label>
      <label className="text-sm text-sky-300">
        Initial assessment (optional)
        <input
          value={assessment}
          onChange={(e) => setAssessment(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-brand/25 px-3 py-2 text-base"
        />
      </label>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Acknowledging…" : "Acknowledge & take ownership"}
      </Button>
    </form>
  );
}
