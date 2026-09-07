"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CaseImpactRecord } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

// §25.1 group 3 — Production Impact (minutes + kg).
//
// Two locked rules from §25.2 shape this whole panel:
//
//   "Missing data must NOT silently become zero." Both fields are optional and
//   an empty box is sent as NULL, never 0. A recorded figure of 0 and an
//   unrecorded figure are different facts, and the display keeps them apart —
//   "not recorded" is never rendered as "0".
//
//   "Financial impact must use an authoritative source/basis." The basis box
//   is mandatory for the same reason: a number with no stated origin is not a
//   KPI, it is a guess.
//
// Corrections are new rows (§27), so the old figure stays visible in the
// history below rather than being overwritten.
export default function ImpactPanel({
  caseId,
  records,
  nameById,
}: {
  caseId: string;
  records: CaseImpactRecord[];
  nameById: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downtime, setDowntime] = useState("");
  const [outputLoss, setOutputLoss] = useState("");
  const [basis, setBasis] = useState("");
  const [correcting, setCorrecting] = useState<string | null>(null);

  // Newest first. The one nothing supersedes is the current figure — same rule
  // the `case_current_impact` view uses server-side.
  const superseded = new Set(
    records.map((r) => r.supersedes_record_id).filter((id): id is string => !!id)
  );
  const sorted = [...records].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const current = sorted.find((r) => !superseded.has(r.id)) ?? null;

  // "" -> null, so an untouched box never arrives at the server as 0.
  function toNumberOrNull(value: string): number | null {
    const trimmed = value.trim();
    return trimmed === "" ? null : Number(trimmed);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("record_production_impact", {
      p_case_id: caseId,
      p_basis: basis,
      p_downtime_minutes: toNumberOrNull(downtime),
      p_output_loss_kg: toNumberOrNull(outputLoss),
      p_supersedes_record_id: correcting,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDowntime("");
    setOutputLoss("");
    setBasis("");
    setCorrecting(null);
    router.refresh();
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="impact-panel"
    >
      <h2 className="text-sm font-semibold text-slate-900">Production impact</h2>

      {current ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
          <div className="flex flex-wrap gap-4">
            <Measure label="Downtime" value={current.downtime_minutes} unit="min" />
            <Measure label="Output loss" value={current.output_loss_kg} unit="kg" />
          </div>
          <p className="mt-1 text-xs text-slate-500">Basis: {current.basis}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No production impact recorded for this case.
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-2">
        {correcting && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            Recording a correction. The earlier figure is kept in the history
            below — it is superseded, not erased.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setCorrecting(null)}
            >
              Cancel correction
            </button>
          </p>
        )}
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-slate-600">
            Downtime (minutes)
            <input
              type="number"
              min="0"
              step="any"
              value={downtime}
              onChange={(e) => setDowntime(e.target.value)}
              placeholder="leave blank if unknown"
              className="mt-0.5 w-full rounded-md border border-slate-300 p-1.5 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-slate-600">
            Output loss (kg)
            <input
              type="number"
              min="0"
              step="any"
              value={outputLoss}
              onChange={(e) => setOutputLoss(e.target.value)}
              placeholder="leave blank if unknown"
              className="mt-0.5 w-full rounded-md border border-slate-300 p-1.5 text-sm"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Leave a box blank if the figure is not known. A blank is recorded as
          &ldquo;not recorded&rdquo; — it is not treated as zero.
        </p>
        <label className="text-xs text-slate-600">
          Source / basis (required)
          <input
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            placeholder="e.g. line stoppage log, shift production report"
            className="mt-0.5 w-full rounded-md border border-slate-300 p-1.5 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button size="sm" type="submit" className="self-start" disabled={submitting}>
          {correcting ? "Record correction" : "Record impact"}
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
                  <div className="flex flex-wrap items-center gap-3">
                    <span>
                      Downtime:{" "}
                      {r.downtime_minutes === null ? (
                        <em className="text-slate-400">not recorded</em>
                      ) : (
                        `${r.downtime_minutes} min`
                      )}
                    </span>
                    <span>
                      Output loss:{" "}
                      {r.output_loss_kg === null ? (
                        <em className="text-slate-400">not recorded</em>
                      ) : (
                        `${r.output_loss_kg} kg`
                      )}
                    </span>
                    {isSuperseded && <span className="text-amber-700">superseded</span>}
                  </div>
                  <p className="mt-0.5">Basis: {r.basis}</p>
                  <p className="mt-0.5 text-slate-400">
                    {nameById[r.recorded_by] ?? "unknown"} ·{" "}
                    {new Date(r.recorded_at).toLocaleString()}
                  </p>
                  {!isSuperseded && (
                    <button
                      type="button"
                      onClick={() => setCorrecting(r.id)}
                      className="mt-1 underline"
                    >
                      Correct this figure
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

// The whole point of §25.2's "missing data must NOT silently become zero" lives
// in this one component: null renders as words, not as a number.
function Measure({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      {value === null ? (
        <p className="text-sm italic text-slate-400">not recorded</p>
      ) : (
        <p className="text-base font-semibold text-slate-900">
          {value}
          <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>
        </p>
      )}
    </div>
  );
}
