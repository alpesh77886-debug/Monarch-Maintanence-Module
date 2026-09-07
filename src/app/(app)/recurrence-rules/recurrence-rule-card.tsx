"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RecurrenceRule } from "@/lib/supabase/database.types";

// Loop 23: `set_recurrence_rule_active` toggle — Manager-only, and the RPC
// itself requires a reason for either direction, so this never silently
// flips a rule without one being recorded (matching the audited-not-deleted
// discipline used for the test rule in Loops 15/20/21's own verification
// runs).
export default function RecurrenceRuleCard({
  rule,
  isManager,
  createdByName,
}: {
  rule: RecurrenceRule;
  isManager: boolean;
  createdByName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function toggle() {
    const why = window.prompt(
      `Reason for ${rule.is_active ? "deactivating" : "reactivating"} "${rule.tier_name}"?`
    );
    if (!why) return;
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_recurrence_rule_active", {
      p_rule_id: rule.id,
      p_is_active: !rule.is_active,
      p_reason: why,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        rule.is_active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-900">{rule.tier_name}</p>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            rule.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {rule.is_active ? "Active" : "Inactive"}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Match on {rule.match_on} · {rule.threshold_count}+ occurrences within{" "}
        {rule.window_days} days
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Set by {createdByName} on {new Date(rule.created_at).toLocaleDateString()}
      </p>
      <p className="mt-1 text-slate-700">{rule.approval_note}</p>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      {isManager && (
        <button
          onClick={toggle}
          disabled={submitting}
          className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50"
        >
          {rule.is_active ? "Deactivate" : "Reactivate"}
        </button>
      )}
    </div>
  );
}
