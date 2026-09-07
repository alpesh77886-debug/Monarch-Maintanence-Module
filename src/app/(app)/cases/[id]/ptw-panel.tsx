"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

// §14.2 PTW seam. Deliberately thin: this records "PTW Required = Yes/No"
// and a linked proof reference — it does not decide WHO may issue, perform,
// or authorize a permit. §14.1 leaves that exact authority matrix PENDING-01,
// and this panel does not pretend otherwise; it is a record of a
// plant-made call, not the call itself.
//
// The gate this exists to back is server-side, in transition_case: once
// ptw_required is true, DIAGNOSING -> IN_REPAIR is refused until a proof is
// linked (§14.2 "formally required proof must exist before governed work
// starts"). This panel only shown while status === "DIAGNOSING", since
// that's the only place the gate can bite.
export default function PtwPanel({
  caseId,
  status,
  ptwRequired,
  ptwProofRef,
}: {
  caseId: string;
  status: string;
  ptwRequired: boolean | null;
  ptwProofRef: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requireReason, setRequireReason] = useState("");
  const [proofRef, setProofRef] = useState("");

  if (status !== "DIAGNOSING" && !ptwRequired) return null;

  async function setRequired(value: boolean) {
    setError(null);
    setSubmitting(true);
    const { error } = await createClient().rpc("set_ptw_required", {
      p_case_id: caseId,
      p_required: value,
      p_reason: requireReason,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRequireReason("");
    router.refresh();
  }

  async function linkProof() {
    setError(null);
    setSubmitting(true);
    const { error } = await createClient().rpc("link_ptw_proof", {
      p_case_id: caseId,
      p_proof_ref: proofRef,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setProofRef("");
    router.refresh();
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="ptw-panel"
    >
      <h2 className="text-sm font-semibold text-slate-900">
        Permit to Work (§14)
      </h2>
      <p className="text-xs text-slate-500">
        PTW required:{" "}
        <span className="font-medium">
          {ptwRequired === null ? "not set" : ptwRequired ? "Yes" : "No"}
        </span>
        {ptwRequired && (
          <>
            {" "}
            · proof:{" "}
            <span className="font-medium">{ptwProofRef ?? "not linked"}</span>
          </>
        )}
      </p>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {status === "DIAGNOSING" && (
        <div className="flex flex-col gap-1">
          <input
            value={requireReason}
            onChange={(e) => setRequireReason(e.target.value)}
            placeholder="Basis for this PTW determination (required)"
            className="rounded-md border border-slate-300 p-1.5 text-sm"
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => setRequired(true)}
              disabled={submitting || !requireReason.trim()}
            >
              PTW required = Yes
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => setRequired(false)}
              disabled={submitting || !requireReason.trim()}
            >
              PTW required = No
            </Button>
          </div>
        </div>
      )}

      {ptwRequired && !ptwProofRef && (
        <div className="flex flex-col gap-1">
          <input
            value={proofRef}
            onChange={(e) => setProofRef(e.target.value)}
            placeholder="Permit / proof reference"
            className="rounded-md border border-slate-300 p-1.5 text-sm"
          />
          <Button
            size="sm"
            type="button"
            className="self-start"
            onClick={linkProof}
            disabled={submitting || !proofRef.trim()}
          >
            Link proof
          </Button>
          <p className="text-xs text-slate-500">
            Repair work cannot start until a proof is linked (§14.2).
          </p>
        </div>
      )}
    </section>
  );
}
