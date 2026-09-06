"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CaseType } from "@/lib/supabase/database.types";

const CASE_TYPES: CaseType[] = [
  "BREAKDOWN",
  "PREVENTIVE",
  "CORRECTIVE",
  "INSPECTION",
  "CALIBRATION",
  "PLANNED_REPLACEMENT",
  "MODIFICATION_IMPROVEMENT",
  "TRIAL_SUPPORT",
];

export default function NewCasePage() {
  const router = useRouter();
  const [caseType, setCaseType] = useState<CaseType>("BREAKDOWN");
  const [symptom, setSymptom] = useState("");
  const [area, setArea] = useState("");
  const [line, setLine] = useState("");
  const [assetKnown, setAssetKnown] = useState(false);
  const [majorComplex, setMajorComplex] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not signed in.");
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from("cases")
      .insert({
        case_type: caseType,
        symptom,
        area: area || null,
        line: line || null,
        asset_known: assetKnown,
        major_complex_flag: majorComplex,
        reporter_user_id: user.id,
      })
      .select("id")
      .single();

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.replace(`/cases/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">Report a case</h1>

      <label className="text-sm font-medium text-slate-700">
        Case type
        <select
          value={caseType}
          onChange={(e) => setCaseType(e.target.value as CaseType)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        >
          {CASE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm font-medium text-slate-700">
        Symptom / complaint
        <textarea
          required
          value={symptom}
          onChange={(e) => setSymptom(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>

      <label className="text-sm font-medium text-slate-700">
        Area (optional)
        <input
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>

      <label className="text-sm font-medium text-slate-700">
        Line (optional)
        <input
          value={line}
          onChange={(e) => setLine(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={assetKnown}
          onChange={(e) => setAssetKnown(e.target.checked)}
        />
        Exact asset/machine is known (link it after acknowledgement)
      </label>

      {/* §5.1 intake minimum: "major/complex indication". §24 marks this
          classification HUMAN REQUIRED at complaint creation — it is a plain
          checkbox, not an algorithmic guess, and it is not later overridden
          here because the pack only documents the classification happening
          at creation, not a change flow for it. */}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={majorComplex}
          onChange={(e) => setMajorComplex(e.target.checked)}
        />
        This is a major / complex case
      </label>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 px-4 py-2 text-base font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit case"}
      </button>
    </form>
  );
}
