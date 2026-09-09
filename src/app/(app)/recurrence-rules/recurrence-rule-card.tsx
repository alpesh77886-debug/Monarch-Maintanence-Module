"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RecurrenceRule } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";
import { formatIst } from "@/lib/format";

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
      className={`rounded-xl border p-4 text-sm shadow-sm ${
        rule.is_active ? "border-line bg-card" : "border-line bg-bg2"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-fg">{rule.tier_name}</p>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            rule.is_active ? "bg-good/10 text-emerald-300" : "bg-bg2 text-muted"
          }`}
        >
          {rule.is_active ? "Active" : "Inactive"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Match on {rule.match_on} · {rule.threshold_count}+ occurrences within{" "}
        {rule.window_days} days
      </p>
      <p className="mt-1 text-xs text-muted">
        Set by {createdByName} on {formatIst(rule.created_at)}
      </p>
      <p className="mt-1 text-fg">{rule.approval_note}</p>
      {error && <p role="alert" className="mt-1 text-sm text-red-300">{error}</p>}
      {isManager && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={toggle} disabled={submitting}>
          {rule.is_active ? "Deactivate" : "Reactivate"}
        </Button>
      )}
    </div>
  );
}
