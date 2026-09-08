"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function CloseReopenActions({
  caseId,
  status,
}: {
  caseId: string;
  status: string;
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
      {error && <p className="text-sm text-red-300">{error}</p>}
      {status === "MAINTENANCE_RELEASED" && (
        <Button className="self-start" onClick={close} disabled={submitting}>
          Close case
        </Button>
      )}
      {status === "CLOSED" && (
        <Button variant="secondary" className="self-start" onClick={reopen} disabled={submitting}>
          Reopen (same problem recurred)
        </Button>
      )}
    </div>
  );
}
