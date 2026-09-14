"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function CloseReopenActions({
  caseId,
  status,
  isManager,
}: {
  caseId: string;
  status: string;
  isManager: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function close() {
    const reason = window.prompt(
      "Closure reason (e.g. production resumed, or production not restarted due to shift end):"
    );
    if (!reason) return;
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: "CLOSED",
      p_reason: reason,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function reopen() {
    const reason = window.prompt("Reason for reopening (same problem recurred)?");
    if (!reason) return;
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reopen_case", {
      p_case_id: caseId,
      p_reason: reason,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {status === "MAINTENANCE_RELEASED" && (
        <Button className="self-start" onClick={close} disabled={submitting}>
          Close case
        </Button>
      )}
      {status === "CLOSED" && isManager && (
        // RISK-32 (Gate 21, Loop 101): reopen authority is Maintenance
        // Manager only — the RPC itself enforces this (maintenance.is_manager()),
        // this just avoids showing a button to an Executive that would
        // always come back FORBIDDEN.
        <Button variant="secondary" className="self-start" onClick={reopen} disabled={submitting}>
          Reopen (same problem recurred)
        </Button>
      )}
    </div>
  );
}
