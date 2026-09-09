"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, FormField } from "@/components/ui";

// Loop 23: §18 configuration UI for `create_recurrence_rule` — Manager-only
// at the RPC layer, so this form is only ever rendered for a Manager (see
// page.tsx). PENDING-04 (the threshold and window) is still open: nothing
// here pre-fills a number. Every field the Manager must decide is left
// blank, forcing a deliberate value each time rather than accepting
// whatever this component happened to default to — the same discipline the
// RPC itself enforces server-side (no DEFAULT on threshold_count or
// window_days). This form does not resolve PENDING-04; it is the tool a
// Manager uses once the Boss has supplied it, and approval_note exists
// specifically to record that basis.
export default function CreateRecurrenceRuleForm() {
  const router = useRouter();
  const [tierName, setTierName] = useState("");
  const [matchOn, setMatchOn] = useState<"ASSET_REF" | "LINE" | "AREA">("LINE");
  const [thresholdCount, setThresholdCount] = useState("");
  const [windowDays, setWindowDays] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    tierName.trim() &&
    thresholdCount.trim() &&
    Number(thresholdCount) >= 2 &&
    windowDays.trim() &&
    Number(windowDays) >= 1 &&
    approvalNote.trim();

  async function submit() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("create_recurrence_rule", {
      p_tier_name: tierName,
      p_match_on: matchOn,
      p_threshold_count: Number(thresholdCount),
      p_window_days: Number(windowDays),
      p_approval_note: approvalNote,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setTierName("");
    setThresholdCount("");
    setWindowDays("");
    setApprovalNote("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4 shadow-sm">
      <p className="text-sm font-medium text-fg">New recurrence rule (§18)</p>
      <p className="text-xs text-muted">
        PENDING-04: no threshold or window is supplied by this app. Enter only a
        value the Boss has explicitly approved, and cite that basis below —
        {" "}<code className="rounded bg-bg2 px-1">approval_note</code> is
        mandatory server-side for exactly this reason.
      </p>
      <FormField label="Evidence tier name" required hint={'e.g. "Line-level, 30-day".'}>
        <input
          value={tierName}
          onChange={(e) => setTierName(e.target.value)}
          className="w-full rounded-lg border border-line2 p-2 text-sm"
        />
      </FormField>
      <div className="flex gap-2">
        <FormField label="Match on">
          <select
            value={matchOn}
            onChange={(e) => setMatchOn(e.target.value as "ASSET_REF" | "LINE" | "AREA")}
            className="w-full rounded-lg border border-line2 p-2 text-sm"
          >
            <option value="LINE">Line</option>
            <option value="AREA">Area</option>
            <option value="ASSET_REF">Asset reference</option>
          </select>
        </FormField>
        <FormField label="Threshold" required hint="Occurrences, min 2." className="flex-1">
          <input
            type="number"
            min="2"
            value={thresholdCount}
            onChange={(e) => setThresholdCount(e.target.value)}
            className="w-full rounded-lg border border-line2 p-2 text-sm"
          />
        </FormField>
        <FormField label="Window" required hint="Days, min 1." className="flex-1">
          <input
            type="number"
            min="1"
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
            className="w-full rounded-lg border border-line2 p-2 text-sm"
          />
        </FormField>
      </div>
      <FormField
        label="Approved basis for this threshold and window"
        required
      >
        <textarea
          value={approvalNote}
          onChange={(e) => setApprovalNote(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-line2 p-2 text-sm"
        />
      </FormField>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button className="self-start" onClick={submit} disabled={submitting || !canSubmit}>
        Create rule
      </Button>
    </div>
  );
}
