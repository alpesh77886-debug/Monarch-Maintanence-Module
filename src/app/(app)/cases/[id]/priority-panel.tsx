"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Priority } from "@/lib/supabase/database.types";

// §5.4: "Executive can change priority. Manager has final override."
//
// Once a Manager sets the priority, an Executive can no longer change it —
// only another Manager decision moves it. That's the server-side rule
// (change_priority re-checks it regardless of what this panel shows); this
// component just reflects the lock so an Executive isn't left guessing why
// the buttons are disabled.
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH"];

export default function PriorityPanel({
  caseId,
  priority,
  priorityLockedByManager,
  isManager,
}: {
  caseId: string;
  priority: Priority | null;
  priorityLockedByManager: boolean;
  isManager: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [choosing, setChoosing] = useState<Priority | null>(null);

  const locked = priorityLockedByManager && !isManager;

  async function apply(newPriority: Priority) {
    setError(null);
    setSubmitting(true);
    const { error } = await createClient().rpc("change_priority", {
      p_case_id: caseId,
      p_priority: newPriority,
      p_reason: reason,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setReason("");
    setChoosing(null);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Priority</h2>
        <span className="text-sm font-medium text-slate-700">{priority ?? "not set"}</span>
      </div>

      {locked && (
        <p className="text-xs text-amber-700">
          Locked by a Manager&rsquo;s decision — only a Manager can change it
          further (§5.4).
        </p>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {!locked && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {PRIORITIES.filter((p) => p !== priority).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setChoosing(p)}
                disabled={submitting}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
              >
                Set {p}
              </button>
            ))}
          </div>
          {choosing && (
            <div className="flex flex-col gap-1">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`Reason for changing to ${choosing} (required)`}
                className="rounded-md border border-slate-300 p-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => apply(choosing)}
                  disabled={submitting || !reason.trim()}
                  className="self-start rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoosing(null);
                    setReason("");
                  }}
                  className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
