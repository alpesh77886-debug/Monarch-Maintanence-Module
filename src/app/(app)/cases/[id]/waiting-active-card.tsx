"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CaseWait } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

export default function WaitingActiveCard({ wait }: { wait: CaseWait }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function callRpc(name: "mark_wait_resolved" | "resume_wait") {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc(name, { p_wait_id: wait.id });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  const canResume = wait.reason_type === "INTERNAL" || !!wait.resume_ready_at;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warn/25 bg-warn/10 p-3">
      <p className="text-sm font-medium text-amber-300">
        WAITING ({wait.reason_type}) since {new Date(wait.entered_at).toLocaleString()}
      </p>
      <p className="text-sm text-amber-300">{wait.reason_text}</p>
      {wait.dependency_ref && (
        <p className="text-xs text-amber-300">Dependency: {wait.dependency_ref}</p>
      )}
      {wait.expected_resolution_info && (
        <p className="text-xs text-amber-300">Expected: {wait.expected_resolution_info}</p>
      )}
      {wait.resume_ready_at && (
        <p className="text-xs font-medium text-emerald-300">
          Resume-ready since {new Date(wait.resume_ready_at).toLocaleString()}
        </p>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        {wait.reason_type === "EXTERNAL" && !wait.resume_ready_at && (
          <Button variant="warning" onClick={() => callRpc("mark_wait_resolved")} disabled={submitting}>
            Mark dependency resolved
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => callRpc("resume_wait")}
          disabled={submitting || !canResume}
        >
          Resume
        </Button>
      </div>
    </div>
  );
}
