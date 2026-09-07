"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Priority } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

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
    <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
              <Button
                key={p}
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setChoosing(p)}
                disabled={submitting}
              >
                Set {p}
              </Button>
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
                <Button
                  size="sm"
                  type="button"
                  onClick={() => apply(choosing)}
                  disabled={submitting || !reason.trim()}
                >
                  Confirm
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setChoosing(null);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
