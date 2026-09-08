"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

// §17.1/§17.2: any staff may propose a RECURRING plan (needs Manager
// approval before it generates instances); only Manager may create a
// ONE_TIME plan (self-approved). Frequency is never defaulted — a
// RECURRING plan requires one to be typed in.
export default function CreatePlanForm({ isManager }: { isManager: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [planType, setPlanType] = useState<"RECURRING" | "ONE_TIME">("RECURRING");
  const [assetRef, setAssetRef] = useState("");
  const [frequencyDays, setFrequencyDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("create_pm_plan", {
      p_title: title,
      p_plan_type: planType,
      p_asset_ref: assetRef || null,
      p_frequency_days: planType === "RECURRING" ? Number(frequencyDays) : null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setTitle("");
    setAssetRef("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4 shadow-sm">
      <p className="text-sm font-medium text-fg">New PM plan</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="rounded-lg border border-line2 p-2 text-sm"
      />
      <div className="flex gap-2">
        <select
          value={planType}
          onChange={(e) => setPlanType(e.target.value as "RECURRING" | "ONE_TIME")}
          className="rounded-lg border border-line2 p-2 text-sm"
        >
          <option value="RECURRING">Recurring</option>
          <option value="ONE_TIME" disabled={!isManager}>
            One-time / special{!isManager ? " (Manager only)" : ""}
          </option>
        </select>
        <input
          value={assetRef}
          onChange={(e) => setAssetRef(e.target.value)}
          placeholder="Asset ref (optional)"
          className="flex-1 rounded-lg border border-line2 p-2 text-sm"
        />
      </div>
      {planType === "RECURRING" && (
        <input
          type="number"
          min="1"
          value={frequencyDays}
          onChange={(e) => setFrequencyDays(e.target.value)}
          placeholder="Frequency (days)"
          className="rounded-lg border border-line2 p-2 text-sm"
        />
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <Button className="self-start" onClick={submit} disabled={submitting || !title.trim()}>
        Create plan
      </Button>
    </div>
  );
}
