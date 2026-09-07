"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SpareRequest, SpareUsage } from "@/lib/supabase/database.types";

// §16: Maintenance records usage, Stores remains the stock-truth authority
// (never a second inventory ledger). §3.3: the ₹12,000 Manager-approval
// threshold and the approval-proof requirement are enforced server-side in
// raise_spare_request/approve_spare_request/record_spare_usage — this panel
// only reflects what those RPCs already decided, it doesn't decide anything
// itself.
export default function SparesPanel({
  caseId,
  spareRequests,
  spareUsage,
  canRaise,
  canRecordUsage,
  isManager,
  isStaff,
}: {
  caseId: string;
  spareRequests: SpareRequest[];
  spareUsage: SpareUsage[];
  canRaise: boolean;
  canRecordUsage: boolean;
  isManager: boolean;
  isStaff: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [spareName, setSpareName] = useState("");
  const [quantityRequested, setQuantityRequested] = useState("1");
  const [estimatedAmount, setEstimatedAmount] = useState("");

  const [usageSpareRequestId, setUsageSpareRequestId] = useState("");
  const [usageQuantity, setUsageQuantity] = useState("1");
  const [usageAssetRef, setUsageAssetRef] = useState("");
  const [usageOutcome, setUsageOutcome] = useState("");

  const [approvalProofByRequest, setApprovalProofByRequest] = useState<Record<string, string>>({});

  // §16.2: "V1 may record ... explicit Stores/reference identifiers." Kept
  // as free text on both sides — the column itself has no check constraint,
  // deliberately, since the real status vocabulary is Stores' own once
  // Phase-3 integration exists.
  const [storesStatusDraft, setStoresStatusDraft] = useState<Record<string, string>>({});
  const [storesRefDraft, setStoresRefDraft] = useState<Record<string, string>>({});

  async function updateRequestStoresRef(requestId: string) {
    const status = (storesStatusDraft[requestId] ?? "").trim();
    if (!status) {
      setError("A Stores reference status is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_spare_request_stores_reference", {
      p_spare_request_id: requestId,
      p_stores_reference_status: status,
      p_stores_reference_id: storesRefDraft[requestId] || null,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function updateUsageStoresRef(usageId: string) {
    const status = (storesStatusDraft[usageId] ?? "").trim();
    if (!status) {
      setError("A Stores reference status is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_spare_usage_stores_reference", {
      p_spare_usage_id: usageId,
      p_stores_reference_status: status,
      p_stores_reference_id: storesRefDraft[usageId] || null,
    });
    setSubmitting(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function raiseRequest() {
    setError(null);
    if (!spareName.trim()) {
      setError("Spare name is required.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: spareName,
      p_quantity_requested: Number(quantityRequested),
      p_estimated_amount: estimatedAmount ? Number(estimatedAmount) : null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSpareName("");
    setQuantityRequested("1");
    setEstimatedAmount("");
    router.refresh();
  }

  async function approveRequest(requestId: string) {
    setError(null);
    const proof = approvalProofByRequest[requestId] ?? "";
    if (!proof.trim()) {
      setError("Approval proof reference is required.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_spare_request", {
      p_spare_request_id: requestId,
      p_approval_proof_ref: proof,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  async function recordUsage() {
    setError(null);
    // §16.1 mandates every usage be traceable to "which spare was used" —
    // spare_usage has no spare_name of its own, only via the linked
    // request — and §3.3's >₹12,000 gate lives on that same request.
    // record_spare_usage now rejects a null p_spare_request_id server-side
    // (RISK-21); this mirrors that requirement client-side so the error
    // is immediate rather than a round trip.
    if (!usageSpareRequestId) {
      setError("Select the spare request this usage is for — raise one first if none exists yet.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: Number(usageQuantity),
      p_spare_request_id: usageSpareRequestId,
      p_asset_ref: usageAssetRef || null,
      p_outcome: usageOutcome || null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setUsageSpareRequestId("");
    setUsageQuantity("1");
    setUsageAssetRef("");
    setUsageOutcome("");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-semibold text-slate-900">Spares</h2>
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-col gap-1">
        {spareRequests.length === 0 && (
          <p className="text-sm text-slate-500">No spare requests yet.</p>
        )}
        {spareRequests.map((r) => (
          <div key={r.id} className="rounded-md border border-slate-100 p-2 text-sm">
            <p className="font-medium text-slate-800">
              {r.spare_name} × {r.quantity_requested}
              {r.estimated_amount != null ? ` — ₹${r.estimated_amount}` : ""}
            </p>
            <p className="text-xs text-slate-500">
              Requested by {r.initiated_role.toLowerCase()} ·{" "}
              {new Date(r.requested_at).toLocaleString()}
            </p>
            {r.requires_manager_approval && (
              <p className="mt-1 text-xs font-medium text-amber-700">
                {r.approved_at
                  ? `Manager-approved ${new Date(r.approved_at).toLocaleString()} (proof: ${r.approval_proof_ref})`
                  : "Exceeds ₹12,000 — awaiting Manager approval"}
              </p>
            )}
            {isManager && r.requires_manager_approval && !r.approved_at && (
              <div className="mt-2 flex gap-2">
                <input
                  value={approvalProofByRequest[r.id] ?? ""}
                  onChange={(e) =>
                    setApprovalProofByRequest((prev) => ({ ...prev, [r.id]: e.target.value }))
                  }
                  placeholder="Approval proof reference"
                  className="flex-1 rounded-md border border-slate-300 p-1 text-xs"
                />
                <button
                  onClick={() => approveRequest(r.id)}
                  disabled={submitting}
                  className="rounded-md bg-amber-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Approve
                </button>
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Stores: <span className="font-medium">{r.stores_reference_status}</span>
              {r.stores_reference_id ? ` (${r.stores_reference_id})` : ""}
            </p>
            {isStaff && (
              <div className="mt-1 flex gap-2">
                <input
                  value={storesStatusDraft[r.id] ?? ""}
                  onChange={(e) =>
                    setStoresStatusDraft((prev) => ({ ...prev, [r.id]: e.target.value }))
                  }
                  placeholder="Stores status"
                  className="w-32 rounded-md border border-slate-300 p-1 text-xs"
                />
                <input
                  value={storesRefDraft[r.id] ?? ""}
                  onChange={(e) => setStoresRefDraft((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Stores reference (optional)"
                  className="flex-1 rounded-md border border-slate-300 p-1 text-xs"
                />
                <button
                  onClick={() => updateRequestStoresRef(r.id)}
                  disabled={submitting}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                >
                  Update
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canRaise && (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-700">Raise a spare request</p>
          <input
            value={spareName}
            onChange={(e) => setSpareName(e.target.value)}
            placeholder="Spare name"
            className="rounded-md border border-slate-300 p-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0.01"
              step="any"
              value={quantityRequested}
              onChange={(e) => setQuantityRequested(e.target.value)}
              placeholder="Quantity"
              className="w-24 rounded-md border border-slate-300 p-2 text-sm"
            />
            <input
              type="number"
              min="0"
              step="any"
              value={estimatedAmount}
              onChange={(e) => setEstimatedAmount(e.target.value)}
              placeholder="Estimated amount (₹, optional)"
              className="flex-1 rounded-md border border-slate-300 p-2 text-sm"
            />
          </div>
          <button
            onClick={raiseRequest}
            disabled={submitting}
            className="self-start rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-800 disabled:opacity-50"
          >
            Raise request
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
        {spareUsage.length === 0 && (
          <p className="text-sm text-slate-500">No spare usage recorded yet.</p>
        )}
        {spareUsage.map((u) => (
          <div key={u.id} className="rounded-md border border-slate-100 p-2 text-sm">
            <p className="text-slate-800">
              Qty {u.quantity}
              {u.asset_ref ? ` on ${u.asset_ref}` : ""}
              {u.outcome ? ` — ${u.outcome}` : ""}
            </p>
            <p className="text-xs text-slate-400">{new Date(u.used_at).toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">
              Stores: <span className="font-medium">{u.stores_reference_status}</span>
              {u.stores_reference_id ? ` (${u.stores_reference_id})` : ""}
            </p>
            {isStaff && (
              <div className="mt-1 flex gap-2">
                <input
                  value={storesStatusDraft[u.id] ?? ""}
                  onChange={(e) =>
                    setStoresStatusDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                  }
                  placeholder="Stores status"
                  className="w-32 rounded-md border border-slate-300 p-1 text-xs"
                />
                <input
                  value={storesRefDraft[u.id] ?? ""}
                  onChange={(e) => setStoresRefDraft((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  placeholder="Stores reference (optional)"
                  className="flex-1 rounded-md border border-slate-300 p-1 text-xs"
                />
                <button
                  onClick={() => updateUsageStoresRef(u.id)}
                  disabled={submitting}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                >
                  Update
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canRecordUsage && spareRequests.length === 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            No spare requests yet on this case — raise one above before recording usage. Every
            usage must reference the spare request it&apos;s for (§16.1 traceability, §3.3
            financial authority).
          </p>
        </div>
      )}

      {canRecordUsage && spareRequests.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-700">Record spare usage</p>
          <select
            value={usageSpareRequestId}
            onChange={(e) => setUsageSpareRequestId(e.target.value)}
            className="rounded-md border border-slate-300 p-2 text-sm"
          >
            <option value="">(select the spare request this usage is for)</option>
            {spareRequests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.spare_name}
                {r.requires_manager_approval && !r.approved_at ? " (needs approval)" : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              min="0.01"
              step="any"
              value={usageQuantity}
              onChange={(e) => setUsageQuantity(e.target.value)}
              placeholder="Quantity"
              className="w-24 rounded-md border border-slate-300 p-2 text-sm"
            />
            <input
              value={usageAssetRef}
              onChange={(e) => setUsageAssetRef(e.target.value)}
              placeholder="Asset/machine ref (optional)"
              className="flex-1 rounded-md border border-slate-300 p-2 text-sm"
            />
          </div>
          <input
            value={usageOutcome}
            onChange={(e) => setUsageOutcome(e.target.value)}
            placeholder="Outcome (optional)"
            className="rounded-md border border-slate-300 p-2 text-sm"
          />
          <button
            onClick={recordUsage}
            disabled={submitting}
            className="self-start rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-800 disabled:opacity-50"
          >
            Record usage
          </button>
        </div>
      )}
    </section>
  );
}
