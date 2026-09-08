import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { SpareRequest } from "@/lib/supabase/database.types";

// Loop 62 (Prompt §47 "Spare Consumption" module): a minimal real landing
// page listing recent spare requests across cases, with a link into each
// case for the full request/approve/usage flow (spares-panel.tsx) — that
// existing per-case flow is untouched. Loop 63 builds this out further.
export default async function SparesPage() {
  const supabase = await createClient();

  const { data: requests, error } = await supabase
    .from("spare_requests")
    .select(
      "id, case_id, spare_name, quantity_requested, requested_at, estimated_amount, requires_manager_approval, approved_at, stores_reference_status"
    )
    .order("requested_at", { ascending: false })
    .limit(30);

  const rows = (requests ?? []) as Pick<
    SpareRequest,
    | "id"
    | "case_id"
    | "spare_name"
    | "quantity_requested"
    | "requested_at"
    | "estimated_amount"
    | "requires_manager_approval"
    | "approved_at"
    | "stores_reference_status"
  >[];

  const caseIds = [...new Set(rows.map((r) => r.case_id))];
  const { data: cases } = caseIds.length
    ? await supabase.from("cases").select("id, case_number, symptom").in("id", caseIds)
    : { data: [] as { id: string; case_number: string; symptom: string }[] };
  const caseById = new Map((cases ?? []).map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-fg">Spare Consumption</h1>
        <p className="text-sm text-muted">Most recent spare requests, across all cases</p>
      </div>

      {error && (
        <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-red-300">
          Could not load spare requests: {error.message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const c = caseById.get(r.case_id);
          const pendingApproval = r.requires_manager_approval && !r.approved_at;
          return (
            <li key={r.id}>
              <Link
                href={c ? `/cases/${c.id}` : "/cases"}
                className="block rounded-xl border border-line bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg">
                    {r.spare_name} × {r.quantity_requested}
                  </span>
                  {pendingApproval ? (
                    <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                      Awaiting Manager approval
                    </span>
                  ) : (
                    <span className="rounded-full bg-card2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {r.stores_reference_status}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {c ? `${c.case_number} · ${c.symptom}` : "Case unavailable"}
                  {r.estimated_amount != null && ` · ₹${r.estimated_amount.toLocaleString("en-IN")}`}
                </p>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && !error && (
          <p className="rounded-xl border border-dashed border-line2 p-8 text-center text-sm text-muted">
            No spare requests recorded yet.
          </p>
        )}
      </ul>
    </div>
  );
}
