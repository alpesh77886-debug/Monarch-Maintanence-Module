"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

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
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-900">New recurrence rule (§18)</p>
      <p className="text-xs text-slate-500">
        PENDING-04: no threshold or window is supplied by this app. Enter only a
        value the Boss has explicitly approved, and cite that basis below —
        {" "}<code className="rounded bg-slate-100 px-1">approval_note</code> is
        mandatory server-side for exactly this reason.
      </p>
      <input
        value={tierName}
        onChange={(e) => setTierName(e.target.value)}
        placeholder="Evidence tier name (e.g. &quot;Line-level, 30-day&quot;)"
        className="rounded-md border border-slate-300 p-2 text-sm"
      />
      <div className="flex gap-2">
        <select
          value={matchOn}
          onChange={(e) => setMatchOn(e.target.value as "ASSET_REF" | "LINE" | "AREA")}
          className="rounded-md border border-slate-300 p-2 text-sm"
        >
          <option value="LINE">Match on: Line</option>
          <option value="AREA">Match on: Area</option>
          <option value="ASSET_REF">Match on: Asset reference</option>
        </select>
        <input
          type="number"
          min="2"
          value={thresholdCount}
          onChange={(e) => setThresholdCount(e.target.value)}
          placeholder="Threshold (occurrences, min 2)"
          className="flex-1 rounded-md border border-slate-300 p-2 text-sm"
        />
        <input
          type="number"
          min="1"
          value={windowDays}
          onChange={(e) => setWindowDays(e.target.value)}
          placeholder="Window (days, min 1)"
          className="flex-1 rounded-md border border-slate-300 p-2 text-sm"
        />
      </div>
      <textarea
        value={approvalNote}
        onChange={(e) => setApprovalNote(e.target.value)}
        placeholder="Approved basis for this threshold and window (required)"
        rows={2}
        className="rounded-md border border-slate-300 p-2 text-sm"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button className="self-start" onClick={submit} disabled={submitting || !canSubmit}>
        Create rule
      </Button>
    </div>
  );
}
