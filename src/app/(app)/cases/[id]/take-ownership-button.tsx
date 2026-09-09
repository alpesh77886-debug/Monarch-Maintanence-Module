"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

// Loop 39 (RISK-27): `take_ownership` has existed and been tested since early
// on — including the §28 first-valid-actor race guard — but nothing in the app
// ever called it. Acknowledging a case assigns ownership, so a REPORTED case
// was covered; a case that LOSES its owner later was not.
//
// That state is not hypothetical, it is designed: §22.1's shift-end handover
// deliberately sets the owner to NULL when nobody is available, and the
// dashboard deliberately lists those cases under "Unassigned — waiting for a
// Maintenance owner". Until now it listed them with no way to claim one.
export default function TakeOwnershipButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function takeOwnership() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("take_ownership", { p_case_id: caseId });
    setSubmitting(false);
    if (error) {
      // ALREADY_OWNED is the deterministic conflict response §28 requires when
      // two Executives claim the same case at once — shown as-is rather than
      // swallowed, so the loser knows why nothing happened.
      return setError(error.message);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warn/25 bg-warn/10 p-3">
      <p className="text-sm text-amber-300">
        This case has no Maintenance owner.
      </p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div>
        <Button variant="warning" onClick={takeOwnership} disabled={submitting}>
          Take ownership
        </Button>
      </div>
    </div>
  );
}
