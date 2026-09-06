"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function WaitingForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reasonType, setReasonType] = useState<"INTERNAL" | "EXTERNAL">("EXTERNAL");
  const [reasonText, setReasonText] = useState("");
  const [dependencyRef, setDependencyRef] = useState("");
  const [expectedInfo, setExpectedInfo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: reasonType,
      p_reason_text: reasonText,
      p_dependency_ref: dependencyRef || null,
      p_expected_resolution_info: expectedInfo || null,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setReasonText("");
    setDependencyRef("");
    setExpectedInfo("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
      >
        + Put case into WAITING
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3"
    >
      <p className="text-sm font-medium text-amber-900">Enter WAITING</p>
      <label className="text-sm text-amber-900">
        Reason type
        <select
          value={reasonType}
          onChange={(e) => setReasonType(e.target.value as "INTERNAL" | "EXTERNAL")}
          className="mt-1 block w-full rounded-md border border-amber-300 px-3 py-2 text-base"
        >
          <option value="EXTERNAL">EXTERNAL (vendor, another department)</option>
          <option value="INTERNAL">INTERNAL (within Maintenance)</option>
        </select>
      </label>
      <label className="text-sm text-amber-900">
        Reason (required)
        <textarea
          required
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-amber-300 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-amber-900">
        Dependency reference (PO number, ticket, etc.)
        <input
          value={dependencyRef}
          onChange={(e) => setDependencyRef(e.target.value)}
          className="mt-1 block w-full rounded-md border border-amber-300 px-3 py-2 text-base"
        />
      </label>
      <label className="text-sm text-amber-900">
        Expected resolution info
        <input
          value={expectedInfo}
          onChange={(e) => setExpectedInfo(e.target.value)}
          className="mt-1 block w-full rounded-md border border-amber-300 px-3 py-2 text-base"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Enter WAITING"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-amber-300 px-4 py-2 text-sm text-amber-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
