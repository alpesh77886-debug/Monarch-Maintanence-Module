import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MaintenanceCase } from "@/lib/supabase/database.types";
import { StatusBadge, Badge } from "@/components/ui";

// Loop 62 (Prompt §47 "My Work" module): cases currently owned by the
// signed-in user. A minimal real landing page — Loop 63 folds this into the
// relabeled bottom nav; this loop only makes sure the Hub tile lands
// somewhere real, per the mockup's own "every destination must map to a
// real route" rule.
const TERMINAL = ["CLOSED", "REJECTED", "DUPLICATE"];

export default async function MyWorkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: cases, error } = await supabase
    .from("cases")
    .select("id, case_number, case_type, status, priority, symptom, area, line, created_at, major_complex_flag")
    .eq("current_owner_user_id", user?.id ?? "")
    .not("status", "in", `(${TERMINAL.join(",")})`)
    .order("created_at", { ascending: true });

  const rows = (cases ?? []) as Pick<
    MaintenanceCase,
    "id" | "case_number" | "case_type" | "status" | "priority" | "symptom" | "area" | "line" | "created_at" | "major_complex_flag"
  >[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-fg">My Work</h1>
        <p className="text-sm text-muted">
          {rows.length} case{rows.length === 1 ? "" : "s"} currently owned by you
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-red-300">
          Could not load your work: {error.message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((c) => (
          <li key={c.id}>
            <Link
              href={`/cases/${c.id}`}
              className="block rounded-xl border border-line bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted">{c.case_number}</span>
                <StatusBadge status={c.status} />
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
              </p>
            </Link>
          </li>
        ))}
        {rows.length === 0 && !error && (
          <p className="rounded-xl border border-dashed border-line2 p-8 text-center text-sm text-muted">
            No open cases owned by you right now.
          </p>
        )}
      </ul>
    </div>
  );
}
