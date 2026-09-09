"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PmInstance } from "@/lib/supabase/database.types";
import { Button, FormField } from "@/components/ui";
import { formatIst } from "@/lib/format";

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-bg2 text-fg",
  OVERDUE: "bg-bad/15 text-red-300",
  COMPLETED: "bg-good/15 text-emerald-300",
  RESCHEDULED: "bg-card2 text-muted",
};

// §17.3 execution/assignment (link to a case) and §17.4 rescheduling
// (never erases history — reschedule_pm_instance opens a new row instead
// of editing due_at in place).
export default function PmInstanceCard({
  instance,
  planTitle,
  linkedCaseNumber,
}: {
  instance: PmInstance;
  planTitle: string;
  linkedCaseNumber: string | null;
}) {
  const router = useRouter();
  const [caseNumber, setCaseNumber] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function linkToCase() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { data: found, error: lookupErr } = await supabase
      .from("cases")
      .select("id")
      .eq("case_number", caseNumber.trim())
      .maybeSingle();
    if (lookupErr || !found) {
      setSubmitting(false);
      setError(`Case "${caseNumber}" not found.`);
      return;
    }
    const { error } = await supabase.rpc("link_pm_instance_to_case", {
      p_pm_instance_id: instance.id,
      p_case_id: found.id,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  async function complete() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("complete_pm_instance", { p_pm_instance_id: instance.id });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  async function reschedule() {
    setError(null);
    if (!newDueAt || !rescheduleReason.trim()) {
      setError("A new date and a reason are required to reschedule.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reschedule_pm_instance", {
      p_pm_instance_id: instance.id,
      p_new_due_at: new Date(newDueAt).toISOString(),
      p_reason: rescheduleReason,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  const canAct = instance.status === "SCHEDULED" || instance.status === "OVERDUE";

  return (
    <div className="rounded-xl border border-line bg-card p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-fg">{planTitle}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[instance.status]}`}>
          {instance.status}
        </span>
      </div>
      {/* formatIst avoids a server/client hydration mismatch — see src/lib/format.ts */}
      <p className="mt-1 text-xs text-muted">
        Due {formatIst(instance.due_at)}
        {instance.overdue_since ? ` · overdue since ${formatIst(instance.overdue_since)}` : ""}
      </p>
      {instance.case_id && (
        <p className="mt-1 text-xs">
          Linked case:{" "}
          {linkedCaseNumber ? (
            <Link href={`/cases/${instance.case_id}`} className="font-medium text-sky-300">
              {linkedCaseNumber}
            </Link>
          ) : (
            instance.case_id
          )}
        </p>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-red-300">{error}</p>}
      {canAct && (
        <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
          {!instance.case_id && (
            <div className="flex gap-2 items-end">
              <FormField label="Case number to link" required className="flex-1">
                <input
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  className="w-full rounded-lg border border-line2 p-1 text-xs"
                />
              </FormField>
              <Button
                variant="secondary"
                size="sm"
                onClick={linkToCase}
                disabled={submitting || !caseNumber.trim()}
              >
                Link case
              </Button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <FormField label="New due date" required>
              <input
                type="datetime-local"
                value={newDueAt}
                onChange={(e) => setNewDueAt(e.target.value)}
                className="rounded-lg border border-line2 p-1 text-xs"
              />
            </FormField>
            <FormField label="Reschedule reason" required className="flex-1">
              <input
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                className="w-full rounded-lg border border-line2 p-1 text-xs"
              />
            </FormField>
            <Button variant="secondary" size="sm" onClick={reschedule} disabled={submitting}>
              Reschedule
            </Button>
          </div>
          <Button variant="success" size="sm" className="self-start" onClick={complete} disabled={submitting}>
            Mark completed
          </Button>
        </div>
      )}
    </div>
  );
}
