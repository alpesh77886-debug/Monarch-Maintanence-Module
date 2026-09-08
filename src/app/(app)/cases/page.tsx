import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MaintenanceCase } from "@/lib/supabase/database.types";
import { StatusBadge, Badge } from "@/components/ui";

// Loop 64 (Prompt §8, mockup Screen 003): Case Queue rebuilt as a work
// queue, not a plain list. Search + status filter chips are plain GET
// form/links — no client JS needed, no client-side data layer invented
// (Prompt §24/§38: don't add complexity merely to look faster).

function formatAge(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

type Row = Pick<
  MaintenanceCase,
  | "id"
  | "case_number"
  | "case_type"
  | "status"
  | "priority"
  | "symptom"
  | "area"
  | "line"
  | "current_owner_user_id"
  | "created_at"
  | "major_complex_flag"
  | "emergency_claimed"
>;

// Urgency-first, per Prompt §7/§8: an active emergency claim outranks
// everything, then unassigned work, then HIGH priority — all real fields,
// nothing inferred. Ties broken oldest-first (age is real; there is no
// case-level SLA in the locked pack to rank by instead).
function urgencyRank(c: Row): number {
  if (c.emergency_claimed) return 0;
  if (!c.current_owner_user_id) return 1;
  if (c.priority === "HIGH") return 2;
  return 3;
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const supabase = await createClient();

  // Search is applied in JS after fetch, not via a PostgREST `.or()` filter
  // string — a symptom can legitimately contain a comma or parenthesis,
  // which would otherwise break (or silently misparse) the or-filter
  // syntax. The 200-row cap keeps this a non-issue at this data volume.
  const { data: allRows, error } = await supabase
    .from("cases")
    .select(
      "id, case_number, case_type, status, priority, symptom, area, line, current_owner_user_id, created_at, major_complex_flag, emergency_claimed"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  let fetched = (allRows ?? []) as Row[];
  if (q && q.trim()) {
    const term = q.trim().toLowerCase();
    fetched = fetched.filter((c) =>
      [c.symptom, c.case_number, c.area, c.line].some((field) => field?.toLowerCase().includes(term))
    );
  }

  // Chip set is derived from what's actually present, per Prompt §7: "the
  // exact labels/values must come from real data and current rules" — never
  // a hardcoded status list that could show an empty or nonexistent chip.
  const statusCounts = new Map<string, number>();
  for (const c of fetched) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
  const availableStatuses = [...statusCounts.keys()].sort();

  const filtered = status ? fetched.filter((c) => c.status === status) : fetched;
  const sorted = [...filtered].sort((a, b) => {
    const rankDiff = urgencyRank(a) - urgencyRank(b);
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  function chipHref(nextStatus?: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextStatus) params.set("status", nextStatus);
    const qs = params.toString();
    return qs ? `/cases?${qs}` : "/cases";
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg">Case Queue</h1>
          <p className="text-sm text-muted">
            {sorted.length} case{sorted.length === 1 ? "" : "s"}
            {status ? ` · filtered by ${status}` : ""}
          </p>
        </div>
      </div>

      <form method="GET" action="/cases" className="flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search case ID, symptom, area..."
          className="w-full rounded-lg border border-line2 bg-card px-3 py-2 text-sm text-fg placeholder:text-muted2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </form>

      <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <Link
          href={chipHref()}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
            !status ? "bg-brand text-white" : "bg-card2 text-muted"
          }`}
        >
          ALL ({fetched.length})
        </Link>
        {availableStatuses.map((s) => (
          <Link
            key={s}
            href={chipHref(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              status === s ? "bg-brand text-white" : "bg-card2 text-muted"
            }`}
          >
            {s} ({statusCounts.get(s)})
          </Link>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-red-300">
          Could not load cases: {error.message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {sorted.map((c) => (
          <li key={c.id}>
            <Link
              href={`/cases/${c.id}`}
              className={`block rounded-xl border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2 ${
                c.emergency_claimed ? "border-bad/30" : "border-line"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted">{c.case_number}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-muted">{formatAge(c.created_at)}</span>
                  {c.emergency_claimed && (
                    <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-400">
                      Emergency
                    </span>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              <p className="mt-1.5 text-sm font-medium text-fg">
                {c.major_complex_flag && (
                  <Badge tone="danger" className="mr-1.5">
                    MAJOR/COMPLEX
                  </Badge>
                )}
                {c.symptom}
              </p>
              <p className="mt-1.5 flex flex-wrap gap-x-1.5 text-xs text-muted">
                <span>{c.case_type}</span>
                {c.area && <span>· {c.area}</span>}
                {c.line && <span>· {c.line}</span>}
                {c.priority && <span>· Priority: {c.priority}</span>}
                {!c.current_owner_user_id && (
                  <span className="font-medium text-amber-300">· Unassigned</span>
                )}
              </p>
            </Link>
          </li>
        ))}
        {sorted.length === 0 && !error && (
          <p className="rounded-xl border border-dashed border-line2 p-8 text-center text-sm text-muted">
            {q || status ? "No cases match this search/filter." : "No cases yet. Report the first one to get started."}
          </p>
        )}
      </ul>

      <Link
        href="/cases/new"
        aria-label="Report case"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand2 text-2xl font-semibold text-white shadow-[0_8px_24px_rgba(59,130,246,0.4)] md:bottom-6"
      >
        +
      </Link>
    </div>
  );
}
