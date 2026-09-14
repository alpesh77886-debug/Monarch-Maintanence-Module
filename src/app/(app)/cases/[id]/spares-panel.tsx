"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SpareRequest, SpareUsage } from "@/lib/supabase/database.types";
import { Button, FormField } from "@/components/ui";
import { formatIst } from "@/lib/format";

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

  // Boss-requested (Gate 22, Loop 107): a technician often consumes several
  // DIFFERENT materials in one intervention (e.g. 2 bearings + 3 switches +
  // 5 MCBs) — raising a request and recording usage one material at a time
  // was the only path before this. The data model already keeps each
  // material as its own spare_requests/spare_usage row pair (§16.1
  // traceability — a row can't mean "2 bearings AND 3 switches"), so this
  // is a UI convenience only: one row per material, and on submit each row
  // does the same raise_spare_request -> record_spare_usage pair the
  // single-item forms below already do, just looped. No new RPC, no
  // schema change.
  type MaterialRow = { spareName: string; quantity: string; estimatedAmount: string };
  const emptyMaterialRow = (): MaterialRow => ({ spareName: "", quantity: "1", estimatedAmount: "" });
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([emptyMaterialRow()]);
  const [bulkAssetRef, setBulkAssetRef] = useState("");
  const [bulkOutcome, setBulkOutcome] = useState("");
  type MaterialRowResult = { spareName: string; status: "ok" | "needs-approval" | "error"; detail?: string };
  const [bulkResults, setBulkResults] = useState<MaterialRowResult[] | null>(null);

  function updateMaterialRow(index: number, field: keyof MaterialRow, value: string) {
    setMaterialRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }
  function addMaterialRow() {
    setMaterialRows((prev) => [...prev, emptyMaterialRow()]);
  }
  function removeMaterialRow(index: number) {
    setMaterialRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function recordMultipleMaterials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBulkResults(null);
    const rows = materialRows.filter((r) => r.spareName.trim());
    if (rows.length === 0) {
      setError("Add at least one material.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const results: MaterialRowResult[] = [];
    // Sequential, not Promise.all — each row's request+usage pair must
    // land as its own pair of rows regardless of ordering, and a clear
    // per-row result (rather than a scrambled batch) is more useful when
    // one material (e.g. a >₹12,000 item) needs Manager approval and the
    // rest don't.
    for (const row of rows) {
      const { data: reqData, error: reqErr } = await supabase.rpc("raise_spare_request", {
        p_case_id: caseId,
        p_spare_name: row.spareName,
        p_quantity_requested: Number(row.quantity),
        p_estimated_amount: row.estimatedAmount ? Number(row.estimatedAmount) : null,
      });
      if (reqErr) {
        results.push({ spareName: row.spareName, status: "error", detail: reqErr.message });
        continue;
      }
      const requestId = (reqData as { spare_request_id: string }).spare_request_id;
      const { error: usageErr } = await supabase.rpc("record_spare_usage", {
        p_case_id: caseId,
        p_quantity: Number(row.quantity),
        p_spare_request_id: requestId,
        p_asset_ref: bulkAssetRef || null,
        p_outcome: bulkOutcome || null,
      });
      if (usageErr) {
        results.push({
          spareName: row.spareName,
          status: usageErr.message.includes("APPROVAL_REQUIRED") ? "needs-approval" : "error",
          detail: usageErr.message,
        });
        continue;
      }
      results.push({ spareName: row.spareName, status: "ok" });
    }
    setSubmitting(false);
    setBulkResults(results);
    if (results.every((r) => r.status === "ok")) {
      setMaterialRows([emptyMaterialRow()]);
      setBulkAssetRef("");
      setBulkOutcome("");
    }
    router.refresh();
  }

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
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-fg">Spares</h2>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

      <div className="flex flex-col gap-1">
        {spareRequests.length === 0 && (
          <p className="text-sm text-muted">No spare requests yet.</p>
        )}
        {spareRequests.map((r) => (
          <div key={r.id} className="rounded-lg border border-line p-2 text-sm">
            <p className="font-medium text-fg">
              {r.spare_name} × {r.quantity_requested}
              {r.estimated_amount != null ? ` — ₹${r.estimated_amount}` : ""}
            </p>
            <p className="text-xs text-muted">
              Requested by {r.initiated_role.toLowerCase()} ·{" "}
              {formatIst(r.requested_at)}
            </p>
            {r.requires_manager_approval && (
              <p className="mt-1 text-xs font-medium text-amber-300">
                {r.approved_at
                  ? `Manager-approved ${formatIst(r.approved_at)} (proof: ${r.approval_proof_ref})`
                  : "Exceeds ₹12,000 — awaiting Manager approval"}
              </p>
            )}
            {isManager && r.requires_manager_approval && !r.approved_at && (
              <div className="mt-2 flex gap-2">
                <input
                  aria-label="Approval proof reference"
                  value={approvalProofByRequest[r.id] ?? ""}
                  onChange={(e) =>
                    setApprovalProofByRequest((prev) => ({ ...prev, [r.id]: e.target.value }))
                  }
                  placeholder="Approval proof reference"
                  className="flex-1 rounded-lg border border-line2 p-1 text-xs"
                />
                <Button
                  variant="warning"
                  size="sm"
                  onClick={() => approveRequest(r.id)}
                  disabled={submitting}
                >
                  Approve
                </Button>
              </div>
            )}
            <p className="mt-1 text-xs text-muted">
              Stores: <span className="font-medium">{r.stores_reference_status}</span>
              {r.stores_reference_id ? ` (${r.stores_reference_id})` : ""}
            </p>
            {isStaff && (
              <div className="mt-1 flex gap-2">
                <input
                  aria-label="Stores status"
                  value={storesStatusDraft[r.id] ?? ""}
                  onChange={(e) =>
                    setStoresStatusDraft((prev) => ({ ...prev, [r.id]: e.target.value }))
                  }
                  placeholder="Stores status"
                  className="w-32 rounded-lg border border-line2 p-1 text-xs"
                />
                <input
                  aria-label="Stores reference"
                  value={storesRefDraft[r.id] ?? ""}
                  onChange={(e) => setStoresRefDraft((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Stores reference (optional)"
                  className="flex-1 rounded-lg border border-line2 p-1 text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => updateRequestStoresRef(r.id)}
                  disabled={submitting}
                >
                  Update
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canRaise && canRecordUsage && (
        <form
          onSubmit={recordMultipleMaterials}
          className="flex flex-col gap-3 rounded-lg border border-teal/25 bg-teal/10 p-3"
        >
          <p className="text-xs font-medium text-teal-300">
            Record materials used (multiple at once)
          </p>
          <p className="text-xs text-muted">
            One row per material — e.g. 2 bearings, 3 switches, 5 MCBs. Each
            row raises its own spare request and records its own usage, same
            as the single-item forms below, just in one go.
          </p>
          {materialRows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-teal/20 p-2">
              <FormField label="Spare name" required className="min-w-[140px] flex-1">
                <input
                  value={row.spareName}
                  onChange={(e) => updateMaterialRow(i, "spareName", e.target.value)}
                  placeholder="e.g. Bearing 6205"
                  className="w-full rounded-lg border border-line2 p-2 text-sm"
                />
              </FormField>
              <FormField label="Qty" required className="w-20">
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={row.quantity}
                  onChange={(e) => updateMaterialRow(i, "quantity", e.target.value)}
                  className="w-full rounded-lg border border-line2 p-2 text-sm"
                />
              </FormField>
              <FormField label="Est. ₹" hint="If known" className="w-24">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.estimatedAmount}
                  onChange={(e) => updateMaterialRow(i, "estimatedAmount", e.target.value)}
                  className="w-full rounded-lg border border-line2 p-2 text-sm"
                />
              </FormField>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => removeMaterialRow(i)}
                disabled={materialRows.length === 1}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" className="self-start" onClick={addMaterialRow}>
            + Add another material
          </Button>
          <div className="flex gap-2">
            <FormField label="Asset/machine ref" className="flex-1">
              <input
                value={bulkAssetRef}
                onChange={(e) => setBulkAssetRef(e.target.value)}
                className="w-full rounded-lg border border-line2 p-2 text-sm"
              />
            </FormField>
            <FormField label="Outcome" className="flex-1">
              <input
                value={bulkOutcome}
                onChange={(e) => setBulkOutcome(e.target.value)}
                className="w-full rounded-lg border border-line2 p-2 text-sm"
              />
            </FormField>
          </div>
          {bulkResults && (
            <ul className="flex flex-col gap-1 text-xs">
              {bulkResults.map((r, i) => (
                <li
                  key={i}
                  className={
                    r.status === "ok"
                      ? "text-emerald-300"
                      : r.status === "needs-approval"
                        ? "text-amber-300"
                        : "text-red-300"
                  }
                >
                  {r.spareName}:{" "}
                  {r.status === "ok"
                    ? "recorded"
                    : r.status === "needs-approval"
                      ? "raised, but exceeds ₹12,000 — needs Manager approval before usage is recorded (approve above, then record it in \"Record spare usage\" below)"
                      : r.detail}
                </li>
              ))}
            </ul>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Recording…" : "Record all"}
          </Button>
        </form>
      )}

      {canRaise && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-xs font-medium text-fg">Raise a spare request</p>
          <FormField label="Spare name" required>
            <input
              value={spareName}
              onChange={(e) => setSpareName(e.target.value)}
              className="w-full rounded-lg border border-line2 p-2 text-sm"
            />
          </FormField>
          <div className="flex gap-2">
            <FormField label="Quantity" required className="w-24">
              <input
                type="number"
                min="0.01"
                step="any"
                value={quantityRequested}
                onChange={(e) => setQuantityRequested(e.target.value)}
                className="w-full rounded-lg border border-line2 p-2 text-sm"
              />
            </FormField>
            <FormField label="Estimated amount" hint="₹, if known." className="flex-1">
              <input
                type="number"
                min="0"
                step="any"
                value={estimatedAmount}
                onChange={(e) => setEstimatedAmount(e.target.value)}
                className="w-full rounded-lg border border-line2 p-2 text-sm"
              />
            </FormField>
          </div>
          <Button variant="secondary" className="self-start" onClick={raiseRequest} disabled={submitting}>
            Raise request
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t border-line pt-3">
        {spareUsage.length === 0 && (
          <p className="text-sm text-muted">No spare usage recorded yet.</p>
        )}
        {spareUsage.map((u) => (
          <div key={u.id} className="rounded-lg border border-line p-2 text-sm">
            <p className="text-fg">
              Qty {u.quantity}
              {u.asset_ref ? ` on ${u.asset_ref}` : ""}
              {u.outcome ? ` — ${u.outcome}` : ""}
            </p>
            <p className="text-xs text-muted2">{formatIst(u.used_at)}</p>
            <p className="mt-1 text-xs text-muted">
              Stores: <span className="font-medium">{u.stores_reference_status}</span>
              {u.stores_reference_id ? ` (${u.stores_reference_id})` : ""}
            </p>
            {isStaff && (
              <div className="mt-1 flex gap-2">
                <input
                  aria-label="Stores status"
                  value={storesStatusDraft[u.id] ?? ""}
                  onChange={(e) =>
                    setStoresStatusDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                  }
                  placeholder="Stores status"
                  className="w-32 rounded-lg border border-line2 p-1 text-xs"
                />
                <input
                  aria-label="Stores reference"
                  value={storesRefDraft[u.id] ?? ""}
                  onChange={(e) => setStoresRefDraft((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  placeholder="Stores reference (optional)"
                  className="flex-1 rounded-lg border border-line2 p-1 text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => updateUsageStoresRef(u.id)}
                  disabled={submitting}
                >
                  Update
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canRecordUsage && spareRequests.length === 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-xs text-muted">
            No spare requests yet on this case — raise one above before recording usage. Every
            usage must reference the spare request it&apos;s for (§16.1 traceability, §3.3
            financial authority).
          </p>
        </div>
      )}

      {canRecordUsage && spareRequests.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-xs font-medium text-fg">Record spare usage</p>
          <FormField label="Spare request" required>
            <select
              value={usageSpareRequestId}
              onChange={(e) => setUsageSpareRequestId(e.target.value)}
              className="w-full rounded-lg border border-line2 p-2 text-sm"
            >
              <option value="">(select the spare request this usage is for)</option>
              {spareRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.spare_name}
                  {r.requires_manager_approval && !r.approved_at ? " (needs approval)" : ""}
                </option>
              ))}
            </select>
          </FormField>
          <div className="flex gap-2">
            <FormField label="Quantity" required className="w-24">
              <input
                type="number"
                min="0.01"
                step="any"
                value={usageQuantity}
                onChange={(e) => setUsageQuantity(e.target.value)}
                className="w-full rounded-lg border border-line2 p-2 text-sm"
              />
            </FormField>
            <FormField label="Asset/machine ref" className="flex-1">
              <input
                value={usageAssetRef}
                onChange={(e) => setUsageAssetRef(e.target.value)}
                className="w-full rounded-lg border border-line2 p-2 text-sm"
              />
            </FormField>
          </div>
          <FormField label="Outcome">
            <input
              value={usageOutcome}
              onChange={(e) => setUsageOutcome(e.target.value)}
              className="w-full rounded-lg border border-line2 p-2 text-sm"
            />
          </FormField>
          <Button variant="secondary" className="self-start" onClick={recordUsage} disabled={submitting}>
            Record usage
          </Button>
        </div>
      )}
    </section>
  );
}
