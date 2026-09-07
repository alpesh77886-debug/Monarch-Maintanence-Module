import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MaintenanceCase } from "@/lib/supabase/database.types";
import { LinkButton } from "@/components/ui";

const STATUS_STYLES: Record<string, string> = {
  REPORTED: "bg-slate-100 text-slate-700",
  ACKNOWLEDGED: "bg-blue-100 text-blue-700",
  DIAGNOSING: "bg-amber-100 text-amber-700",
  IN_REPAIR: "bg-amber-100 text-amber-700",
  TEMPORARILY_RESTORED: "bg-orange-100 text-orange-700",
  TECHNICALLY_RESTORED: "bg-teal-100 text-teal-700",
  CLEARANCE_PENDING: "bg-purple-100 text-purple-700",
  MAINTENANCE_RELEASED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-slate-200 text-slate-600",
};

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
          <h1 className="text-xl font-semibold text-slate-900">Open work</h1>
          <p className="text-sm text-slate-500">
            {cases?.length ?? 0} case{cases?.length === 1 ? "" : "s"}
          </p>
        </div>
        <LinkButton href="/cases/new">+ Report case</LinkButton>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
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
              className="block rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-500">{c.case_number}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[c.status] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-slate-900">
                {c.major_complex_flag && (
                  <span className="mr-1.5 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">
                    MAJOR/COMPLEX
                  </span>
                )}
                {c.symptom}
              </p>
              <p className="mt-1.5 flex flex-wrap gap-x-1.5 text-xs text-slate-500">
                <span>{c.case_type}</span>
                {c.area && <span>· {c.area}</span>}
                {c.line && <span>· {c.line}</span>}
                {c.priority && <span>· Priority: {c.priority}</span>}
                {!c.current_owner_user_id && (
                  <span className="font-medium text-amber-600">· Unassigned</span>
                )}
              </p>
            </Link>
          </li>
        ))}
        {cases?.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No cases yet. Report the first one to get started.
          </p>
        )}
      </ul>
    </div>
  );
}
