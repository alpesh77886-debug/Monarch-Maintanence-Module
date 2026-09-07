"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function RestorationForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"TEMPORARY" | "TECHNICAL">("TECHNICAL");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("record_restoration", {
      p_case_id: caseId,
      p_restoration_type: type,
      p_details: details,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDetails("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        + Record restoration
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4"
    >
      <label className="text-sm text-teal-900">
        Restoration type
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "TEMPORARY" | "TECHNICAL")}
          className="mt-1 block w-full rounded-md border border-teal-300 px-3 py-2 text-base"
        >
          <option value="TECHNICAL">Technical (permanent, needs verification)</option>
          <option value="TEMPORARY">Temporary (stop-gap, not a closure)</option>
        </select>
      </label>
      <label className="text-sm text-teal-900">
        Details
        <textarea
          required
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-teal-300 px-3 py-2 text-base"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Record"}
        </Button>
        <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
