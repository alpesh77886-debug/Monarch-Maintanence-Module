"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
      >
        + Assign technician
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3"
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
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Assigning…" : "Assign"}
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
