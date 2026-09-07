"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CaseRootCause } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

// §9 item 6 + §9.1 — validated root cause.
//
// §9.1 is explicit: root cause must NOT be inferred from symptom text alone,
// and only an authorized human process may validate and record it. So the
// basis box is mandatory for the same reason the impact panel's basis box
// is (§25.2) — a root cause with no stated validation is a guess dressed up
// as a finding. Corrections supersede rather than overwrite (§8, §27), so
// the record this panel shows first is the newest one, with the history
// kept below it exactly like ImpactPanel.
export default function RootCausePanel({
  caseId,
  records,
  nameById,
}: {
  caseId: string;
  records: CaseRootCause[];
  nameById: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rootCause, setRootCause] = useState("");
  const [basis, setBasis] = useState("");
  const [correcting, setCorrecting] = useState<string | null>(null);

  const superseded = new Set(
    records.map((r) => r.supersedes_record_id).filter((id): id is string => !!id)
  );
  const sorted = [...records].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const current = sorted.find((r) => !superseded.has(r.id)) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await createClient().rpc("record_root_cause", {
      p_case_id: caseId,
      p_root_cause: rootCause,
      p_basis: basis,
      p_supersedes_record_id: correcting,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRootCause("");
    setBasis("");
    setCorrecting(null);
    router.refresh();
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="root-cause-panel"
    >
      <h2 className="text-sm font-semibold text-slate-900">Root cause (§9)</h2>

      {current ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
          <p className="font-medium text-slate-900">{current.root_cause}</p>
          <p className="mt-1 text-xs text-slate-500">Basis: {current.basis}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No validated root cause recorded for this case. That is a valid
          state — root cause is never inferred automatically (§9.1).
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-2">
        {correcting && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            Recording a correction. The earlier finding is kept in the
            history below — it is superseded, not erased.{" "}
            <button type="button" className="underline" onClick={() => setCorrecting(null)}>
              Cancel correction
            </button>
          </p>
        )}
        <label className="text-xs text-slate-600">
          Root cause
          <input
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            placeholder="what actually caused the failure"
            className="mt-0.5 w-full rounded-md border border-slate-300 p-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Basis (required) — how this was validated
          <input
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            placeholder="e.g. component sectioned and inspected, vendor failure report"
            className="mt-0.5 w-full rounded-md border border-slate-300 p-1.5 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button
          size="sm"
          type="submit"
          className="self-start"
          disabled={submitting || !rootCause.trim() || !basis.trim()}
        >
          {correcting ? "Record correction" : "Record root cause"}
        </Button>
      </form>

      {sorted.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-slate-500">History</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {sorted.map((r) => {
              const isSuperseded = superseded.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`rounded-md border p-2 text-xs ${
                    isSuperseded
                      ? "border-slate-200 bg-slate-50 text-slate-500"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.root_cause}</span>
                    {isSuperseded && <span className="text-amber-700">superseded</span>}
                  </div>
                  <p className="mt-0.5">Basis: {r.basis}</p>
                  <p className="mt-0.5 text-slate-400">
                    {nameById[r.recorded_by] ?? "unknown"} · {new Date(r.recorded_at).toLocaleString()}
                  </p>
                  {!isSuperseded && (
                    <button
                      type="button"
                      onClick={() => setCorrecting(r.id)}
                      className="mt-1 underline"
                    >
                      Correct this finding
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
