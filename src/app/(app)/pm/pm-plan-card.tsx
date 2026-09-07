"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PmPlan } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

// §17.3: Manager approves the schedule/plan.
export default function PmPlanCard({ plan, isManager }: { plan: PmPlan; isManager: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function approve() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_pm_plan", { p_pm_plan_id: plan.id });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div data-testid="pm-plan-card" className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-900">{plan.title}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {plan.plan_type}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {plan.asset_ref ? `${plan.asset_ref} · ` : ""}
        {plan.plan_type === "RECURRING" ? `every ${plan.frequency_days} days` : "one-time"}
      </p>
      <p className="mt-1 text-xs">
        {plan.approved_at ? (
          <span className="font-medium text-emerald-700">
            Approved {new Date(plan.approved_at).toLocaleString()}
          </span>
        ) : (
          <span className="font-medium text-amber-700">Awaiting Manager approval</span>
        )}
      </p>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      {isManager && !plan.approved_at && (
        <Button variant="warning" size="sm" className="mt-2" onClick={approve} disabled={submitting}>
          Approve
        </Button>
      )}
    </div>
  );
}
