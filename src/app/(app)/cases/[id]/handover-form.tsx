"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StaffMember } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

// §22.1: manual handover is the preferred path. §5.6: ownership history is
// preserved and case age does not reset — both are enforced in
// handover_case, not here.
export default function HandoverForm({
  caseId,
  staff,
  currentOwnerId,
}: {
  caseId: string;
  staff: StaffMember[];
  currentOwnerId: string | null;
}) {
  const router = useRouter();
  const candidates = staff.filter((s) => s.id !== currentOwnerId);
  const [toUserId, setToUserId] = useState(candidates[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError("A handover reason is required.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("handover_case", {
      p_case_id: caseId,
      p_to_user_id: toUserId,
      p_reason: reason,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setReason("");
    router.refresh();
  }

  if (candidates.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4 shadow-sm">
      <p className="text-sm font-medium text-fg">Hand over this case</p>
      <select
        value={toUserId}
        onChange={(e) => setToUserId(e.target.value)}
        className="rounded-lg border border-line2 p-2 text-sm"
      >
        {candidates.map((s) => (
          <option key={s.id} value={s.id}>
            {s.full_name} ({s.role === "MAINTENANCE_MANAGER" ? "Manager" : "Executive"})
            {s.is_available ? "" : " — off shift"}
          </option>
        ))}
      </select>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Handover reason"
        className="rounded-lg border border-line2 p-2 text-sm"
      />
      {error && <p className="text-sm text-red-300">{error}</p>}
      <Button variant="secondary" className="self-start" onClick={submit} disabled={submitting || !toUserId}>
        Hand over
      </Button>
    </div>
  );
}
