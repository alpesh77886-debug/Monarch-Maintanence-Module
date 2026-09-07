"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PmInstance } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-slate-100 text-slate-700",
  OVERDUE: "bg-red-100 text-red-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  RESCHEDULED: "bg-slate-200 text-slate-500",
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-900">{planTitle}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[instance.status]}`}>
          {instance.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Due {new Date(instance.due_at).toLocaleString()}
        {instance.overdue_since ? ` · overdue since ${new Date(instance.overdue_since).toLocaleString()}` : ""}
      </p>
      {instance.case_id && (
        <p className="mt-1 text-xs">
          Linked case:{" "}
          {linkedCaseNumber ? (
            <Link href={`/cases/${instance.case_id}`} className="font-medium text-blue-700">
              {linkedCaseNumber}
            </Link>
          ) : (
            instance.case_id
          )}
        </p>
      )}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      {canAct && (
        <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-2">
          {!instance.case_id && (
            <div className="flex gap-2">
              <input
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder="Case number to link"
                className="flex-1 rounded-md border border-slate-300 p-1 text-xs"
              />
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
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={newDueAt}
              onChange={(e) => setNewDueAt(e.target.value)}
              className="rounded-md border border-slate-300 p-1 text-xs"
            />
            <input
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              placeholder="Reschedule reason"
              className="flex-1 rounded-md border border-slate-300 p-1 text-xs"
            />
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
