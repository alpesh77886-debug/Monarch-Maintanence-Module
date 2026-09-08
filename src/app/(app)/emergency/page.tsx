import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MaintenanceCase } from "@/lib/supabase/database.types";
import { StatusBadge, EmptyState } from "@/components/ui";

// Loop 62 (Prompt §47 "Emergency" module): cases with an active emergency
// claim. There is no "EMERGENCY" priority tier in the locked schema —
// Priority is only LOW/MEDIUM/HIGH; emergency is its own claim-then-confirm
// flag pair (see IMPLEMENTATION_PACK.md's emergency two-step). This page
// surfaces that real flag, not an invented priority level.
const TERMINAL = ["CLOSED", "REJECTED", "DUPLICATE"];

export default async function EmergencyPage() {
  const supabase = await createClient();

  const { data: cases, error } = await supabase
    .from("cases")
    .select(
      "id, case_number, status, symptom, area, line, emergency_claimed_by, emergency_claimed_at, emergency_confirmed, emergency_claim_reason, created_at"
    )
    .eq("emergency_claimed", true)
    .not("status", "in", `(${TERMINAL.join(",")})`)
    .order("emergency_claimed_at", { ascending: true });

  const rows = (cases ?? []) as Pick<
    MaintenanceCase,
    | "id"
    | "case_number"
    | "status"
    | "symptom"
    | "area"
    | "line"
    | "emergency_claimed_by"
    | "emergency_claimed_at"
    | "emergency_confirmed"
    | "emergency_claim_reason"
    | "created_at"
  >[];

  const claimantIds = [...new Set(rows.map((c) => c.emergency_claimed_by).filter((id): id is string => !!id))];
  const { data: staff } = claimantIds.length
    ? await supabase.from("staff").select("id, full_name").in("id", claimantIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameById = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-fg">Emergency</h1>
        <p className="text-sm text-muted">
          {rows.length} active emergency claim{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-red-300">
          Could not load emergency cases: {error.message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((c) => (
          <li key={c.id}>
            <Link
              href={`/cases/${c.id}`}
              className="block rounded-xl border border-bad/25 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted">{c.case_number}</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      c.emergency_confirmed ? "bg-bad/15 text-red-400" : "bg-warn/15 text-amber-400"
                    }`}
                  >
                    {c.emergency_confirmed ? "Emergency confirmed" : "Awaiting confirmation"}
                  </span>
                  <StatusBadge status={c.status} />
                </div>
              </div>
              <p className="mt-1.5 text-sm font-medium text-fg">{c.symptom}</p>
              <p className="mt-1.5 flex flex-wrap gap-x-1.5 text-xs text-muted">
                {c.area && <span>{c.area}</span>}
                {c.line && <span>· {c.line}</span>}
                {c.emergency_claimed_by && (
                  <span>· Claimed by {nameById.get(c.emergency_claimed_by) ?? "Unknown"}</span>
                )}
              </p>
              {c.emergency_claim_reason && (
                <p className="mt-1 text-xs italic text-muted2">&ldquo;{c.emergency_claim_reason}&rdquo;</p>
              )}
            </Link>
          </li>
        ))}
        {rows.length === 0 && !error && <EmptyState title="No active emergency claims right now." />}
      </ul>
    </div>
  );
}
