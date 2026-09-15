import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";

// Loop 118 (Boss: "Manager ke 4 screens" — Premium UI v2 mockup screen 2,
// "Manager — Approvals Queue"). Aggregates the pending-approval states that
// actually exist as queryable data across the whole plant (not one case) —
// it does NOT reimplement the approve/confirm actions themselves, which
// already exist as tested, RPC-backed forms (`spares-panel.tsx`'s
// `approve_spare_request`, `emergency-panel.tsx`'s emergency confirmation);
// every row here links straight into the real case where that action lives,
// the same "deep-link instead of duplicate" choice Loop 115 made for the
// Technician workspace.
//
// The mockup shows THREE approval categories; only two are built here:
// - Spare requests awaiting Manager approval (`requires_manager_approval
//   && !approved_at`) — real, matches `/spares/page.tsx`'s own
//   `pendingApproval` computation.
// - Emergency claims awaiting confirmation (`emergency_claimed &&
//   !emergency_confirmed`) — real, matches `/emergency/page.tsx`'s own
//   filter, scoped here to the awaiting-confirmation subset.
//
// The mockup's third card, "Priority Override" (Executive requests HIGH,
// Manager approves/rejects as a queued item), does NOT match how §5.4 is
// actually built: `priority-panel.tsx`/`change_priority` is an immediate
// action with no pending/queued state in the schema at all — an Executive
// sets priority freely until a Manager sets it once, which then locks it.
// There is no "request" row to list and no reject action to wire, so
// building this card would mean inventing a business process CLAUDE.md
// forbids. Left out; flagged in STATUS.md for the Boss rather than faked.
// The mockup's "Reject" button on the spare-approval card was dropped for
// the same reason — no reject/decline RPC exists for spare requests,
// only `approve_spare_request`.

const TERMINAL = ["CLOSED", "REJECTED", "DUPLICATE"];

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!staffRow || staffRow.role !== "MAINTENANCE_MANAGER") {
    return (
      <EmptyState
        title="Approvals is visible to Maintenance Managers only."
        hint="Executives use each case's own Spares tab / emergency claim to see what's pending."
      />
    );
  }

  const [{ data: pendingSpares }, { data: pendingEmergencies }] = await Promise.all([
    supabase
      .from("spare_requests")
      .select("id, case_id, spare_name, quantity_requested, estimated_amount, requested_at, initiated_role")
      .eq("requires_manager_approval", true)
      .is("approved_at", null)
      .order("requested_at", { ascending: true }),
    supabase
      .from("cases")
      .select("id, case_number, symptom, area, line, emergency_claimed_by, emergency_claimed_at, emergency_claim_reason")
      .eq("emergency_claimed", true)
      .eq("emergency_confirmed", false)
      .not("status", "in", `(${TERMINAL.join(",")})`)
      .order("emergency_claimed_at", { ascending: true }),
  ]);

  const spareRows = pendingSpares ?? [];
  const emergencyRows = pendingEmergencies ?? [];

  const caseIds = [...new Set(spareRows.map((r) => r.case_id))];
  const { data: spareCases } = caseIds.length
    ? await supabase.from("cases").select("id, case_number, symptom, area, line").in("id", caseIds)
    : { data: [] as { id: string; case_number: string; symptom: string; area: string | null; line: string | null }[] };
  const caseById = new Map((spareCases ?? []).map((c) => [c.id, c]));

  const totalSpareValue = spareRows.reduce((s, r) => s + (r.estimated_amount ?? 0), 0);
  const totalPending = spareRows.length + emergencyRows.length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-fg">Pending Approvals</h1>
        <p className="text-sm text-muted">
          {totalPending} item{totalPending === 1 ? "" : "s"} awaiting your decision
          {totalSpareValue > 0 && ` · ₹${totalSpareValue.toLocaleString("en-IN")} in spare requests`}
        </p>
      </div>

      {totalPending === 0 && <EmptyState title="Nothing pending right now." />}

      {spareRows.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
            Spare requests ({'>'}₹12,000 — Manager authority)
          </h2>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {spareRows.map((r) => {
              const c = caseById.get(r.case_id);
              return (
                <li key={r.id}>
                  <Link
                    href={`/cases/${r.case_id}?tab=spares`}
                    className="block rounded-xl border border-vio/25 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{r.spare_name}</span>
                      <span className="font-mono text-xs font-bold text-fg">
                        {r.estimated_amount ? `₹${r.estimated_amount.toLocaleString("en-IN")}` : "amount not set"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {c ? `${c.case_number} · ${c.symptom}` : "case unavailable"}
                      {c?.area ? ` · ${c.area}` : ""}
                    </p>
                    <p className="mt-1 text-[10px] text-muted2">
                      {r.quantity_requested} unit{r.quantity_requested === 1 ? "" : "s"} · requested by{" "}
                      {r.initiated_role.toLowerCase()}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {emergencyRows.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
            Emergency claims awaiting confirmation
          </h2>
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {emergencyRows.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cases/${c.id}`}
                  className="block rounded-xl border border-bad/25 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{c.case_number}</span>
                    <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-400">
                      Awaiting confirmation
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-fg">{c.symptom}</p>
                  {c.emergency_claim_reason && (
                    <p className="mt-1 text-xs text-muted">&ldquo;{c.emergency_claim_reason}&rdquo;</p>
                  )}
                  {(c.area || c.line) && (
                    <p className="mt-1 text-[10px] text-muted2">{[c.area, c.line].filter(Boolean).join(" · ")}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
