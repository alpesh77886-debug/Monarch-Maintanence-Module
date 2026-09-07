"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function AssignTechnicianForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { data: technicianId, error: lookupError } = await supabase.rpc(
      "find_user_by_email",
      { p_email: email }
    );

    if (lookupError) {
      setSubmitting(false);
      setError(lookupError.message);
      return;
    }
    if (!technicianId) {
      setSubmitting(false);
      setError(`No user found with email ${email}. They must have signed in at least once.`);
      return;
    }

    const { error: assignError } = await supabase.rpc("assign_technician", {
      p_case_id: caseId,
      p_technician_user_id: technicianId,
    });

    setSubmitting(false);

    if (assignError) {
      setError(assignError.message);
      return;
    }

    setEmail("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        + Assign technician
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <label className="text-sm text-slate-700">
        Technician email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          placeholder="technician@monarch.test"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Assigning…" : "Assign"}
        </Button>
        <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
