"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

// §10: temporary restoration always needs a permanent-repair follow-up.
// TEMPORARILY_RESTORED has no direct edge to TECHNICALLY_RESTORED in the
// locked lifecycle graph — the only valid path back into repair work is
// TEMPORARILY_RESTORED -> IN_REPAIR (or DIAGNOSING), matching Scenario C
// ("IN_REPAIR -> TEMPORARILY_RESTORED -> follow-up -> IN_REPAIR ->
// TECHNICALLY_RESTORED"). This button is that follow-up step.
export default function FollowUpButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function resume(target: "DIAGNOSING" | "IN_REPAIR") {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: target,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-orange/25 bg-orange/10 p-3">
      <p className="text-sm text-orange-300">
        Temporary restoration is not a permanent repair (§10) — resume work to record
        the technical fix.
      </p>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <Button variant="warning" onClick={() => resume("IN_REPAIR")} disabled={submitting}>
          Resume repair (follow-up)
        </Button>
        <Button variant="secondary" onClick={() => resume("DIAGNOSING")} disabled={submitting}>
          Back to diagnosing
        </Button>
      </div>
    </div>
  );
}
