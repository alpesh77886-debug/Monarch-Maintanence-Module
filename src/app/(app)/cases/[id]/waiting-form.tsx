"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, FormField } from "@/components/ui";

type InternalReason =
  | "REPORTING_MANAGER_APPROVAL_PENDING"
  | "PURCHASE_ORDER_RELEASE_PENDING"
  | "OTHER";

const INTERNAL_REASONS: { value: InternalReason; label: string; hint: string }[] = [
  {
    value: "REPORTING_MANAGER_APPROVAL_PENDING",
    label: "Reporting-manager approval pending",
    hint: "The Maintenance Manager is waiting on the authority they report to. Purchase cannot proceed with the PO until it arrives.",
  },
  {
    value: "PURCHASE_ORDER_RELEASE_PENDING",
    label: "Purchase Order release pending",
    hint: "Approval has arrived, but Purchase has not yet released the PO.",
  },
  {
    value: "OTHER",
    label: "Other",
    hint: "Any other legitimate internal dependency. Describe it properly below — a placeholder is rejected.",
  },
];

export default function WaitingForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reasonType, setReasonType] = useState<"INTERNAL" | "EXTERNAL">("EXTERNAL");
  // RISK-25: exactly three INTERNAL reasons, no fourth category. The server
  // enforces the same list and the table has a CHECK constraint — this select
  // decides what is OFFERED, never what is ALLOWED.
  const [internalReason, setInternalReason] = useState<InternalReason>(
    "REPORTING_MANAGER_APPROVAL_PENDING"
  );
  const [reasonText, setReasonText] = useState("");
  const [dependencyRef, setDependencyRef] = useState("");
  const [expectedInfo, setExpectedInfo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: reasonType,
      p_reason_text: reasonText,
      p_dependency_ref: dependencyRef || null,
      p_expected_resolution_info: expectedInfo || null,
      p_internal_reason: reasonType === "INTERNAL" ? internalReason : null,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setReasonText("");
    setDependencyRef("");
    setExpectedInfo("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        + Put case into WAITING
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-warn/25 bg-warn/10 p-4"
    >
      <p className="text-sm font-medium text-amber-300">Enter WAITING</p>
      <FormField label="Reason type" labelClassName="text-amber-300">
        <select
          value={reasonType}
          onChange={(e) => setReasonType(e.target.value as "INTERNAL" | "EXTERNAL")}
          className="block w-full rounded-lg border border-warn/25 px-3 py-2 text-base"
        >
          <option value="EXTERNAL">EXTERNAL (vendor, another department)</option>
          <option value="INTERNAL">INTERNAL (within Maintenance)</option>
        </select>
      </FormField>

      {reasonType === "INTERNAL" && (
        <FormField
          label="Internal dependency"
          required
          labelClassName="text-amber-300"
          hint={`${INTERNAL_REASONS.find((r) => r.value === internalReason)?.hint} Maintenance records this dependency only. It never creates or releases a Purchase Order, and never marks an approval as received — that stays with Purchase and with the approving authority.`}
        >
          <select
            value={internalReason}
            onChange={(e) => setInternalReason(e.target.value as InternalReason)}
            className="block w-full rounded-lg border border-warn/25 px-3 py-2 text-base"
          >
            {INTERNAL_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField label="Reason" required labelClassName="text-amber-300">
        <textarea
          required
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          rows={2}
          className="block w-full rounded-lg border border-warn/25 px-3 py-2 text-base"
        />
      </FormField>
      <FormField
        label="Dependency reference"
        labelClassName="text-amber-300"
        hint="PO number, ticket, etc."
      >
        <input
          value={dependencyRef}
          onChange={(e) => setDependencyRef(e.target.value)}
          className="block w-full rounded-lg border border-warn/25 px-3 py-2 text-base"
        />
      </FormField>
      <FormField label="Expected resolution info" labelClassName="text-amber-300">
        <input
          value={expectedInfo}
          onChange={(e) => setExpectedInfo(e.target.value)}
          className="block w-full rounded-lg border border-warn/25 px-3 py-2 text-base"
        />
      </FormField>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <Button variant="warning" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Enter WAITING"}
        </Button>
        <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
