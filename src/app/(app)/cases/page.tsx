import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MaintenanceCase } from "@/lib/supabase/database.types";
import { LinkButton, StatusBadge, Badge } from "@/components/ui";

export default async function CasesPage() {
  const supabase = await createClient();
  const { data: cases, error } = await supabase
    .from("cases")
    .select(
      "id, case_number, case_type, status, priority, symptom, area, line, current_owner_user_id, created_at, major_complex_flag"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg">Open work</h1>
          <p className="text-sm text-muted">
            {cases?.length ?? 0} case{cases?.length === 1 ? "" : "s"}
          </p>
        </div>
        <LinkButton href="/cases/new">+ Report case</LinkButton>
      </div>

      {error && (
        <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-red-300">
          Could not load cases: {error.message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {(cases as Pick<
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
        >[] | null)?.map((c) => (
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
                {!c.current_owner_user_id && (
                  <span className="font-medium text-amber-300">· Unassigned</span>
                )}
              </p>
            </Link>
          </li>
        ))}
        {cases?.length === 0 && (
          <p className="rounded-xl border border-dashed border-line2 p-8 text-center text-sm text-muted">
            No cases yet. Report the first one to get started.
          </p>
        )}
      </ul>
    </div>
  );
}
