"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

// RISK-33 (§11, Gate 21 Loop 104): the complainant's side of the disagreement
// path. Only rendered when page.tsx's canDisputeRestoration is true (viewer
// is this case's own reporter, a TECHNICAL restoration was just verified
// PASSED, case is still TECHNICALLY_RESTORED, no dispute already pending) —
// raise_restoration_dispute re-checks every one of those server-side anyway.
export default function DisputeRestorationForm({ restorationId }: { restorationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("raise_restoration_dispute", {
      p_restoration_id: restorationId,
      p_reason: reason,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-warn/25 bg-warn/10 p-3">
        <p className="text-sm text-amber-300">
          Executive marked this as fixed. Still not working?
        </p>
        <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
          Machine still not okay
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg border border-warn/25 bg-warn/10 p-3"
    >
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <label className="text-sm text-amber-300">
        What is still wrong? (required)
        <textarea
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-warn/25 px-3 py-2 text-base"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit dispute"}
        </Button>
        <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
