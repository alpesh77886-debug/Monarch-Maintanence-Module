"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CaseType } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

// Loop 66 (Prompt §13 "New Case — fast, mobile, real"): rebuilt from one
// flat form into a progressive flow — "Report a problem", not "fill a
// maintenance record". Every field below is the SAME field the flat form
// already collected, inserted via the SAME plain `.insert()` (no RPC
// existed here to begin with) — this is a step-by-step presentation of
// unchanged data collection, not a new intake contract.
//
// No priority/seriousness step: this pack's own Loop 54 gap-fix (G2) was a
// direct Boss decision — priority stays set at Acknowledge, not intake —
// so adding one here would silently reverse a locked decision, exactly
// what "no invented values" forbids. No evidence-capture step either:
// evidence attachment is an existing, unchanged Case Detail action
// (EvidencePanel, post-creation) — building a new upload-at-intake feature
// is new scope this loop doesn't take on.
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

const STEPS = ["What happened?", "Where?", "Anything else?", "Review"] as const;

export default function NewCasePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [caseType, setCaseType] = useState<CaseType>("BREAKDOWN");
  const [symptom, setSymptom] = useState("");
  const [area, setArea] = useState("");
  const [line, setLine] = useState("");
  const [shift, setShift] = useState("");
  const [assetKnown, setAssetKnown] = useState(false);
  const [majorComplex, setMajorComplex] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const symptomValid = symptom.trim().length >= 10;
  const canAdvanceFromStep0 = symptomValid;

  function next() {
    setError(null);
    if (step === 0 && !canAdvanceFromStep0) {
      setError("Describe the problem in at least 10 characters before continuing.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
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
        shift: shift || null,
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
    <div className="flex flex-col gap-4">
      {/* Loop 87: this flow only ever showed a "Back" button once inside
          step 1+ (step > 0) - at step 0, where every entry lands, there
          was no way to leave the flow itself (only the header/AppNav,
          same class of gap as Loop 86's Boss-reported bug). Matches
          Case Detail's own "← All cases" pattern exactly. */}
      <Link href="/cases" className="text-xs font-medium text-muted hover:text-fg">
        ← All cases
      </Link>
      <div>
        <h1 className="text-lg font-semibold text-fg">Report a problem</h1>
        <p className="mt-1 text-xs text-muted">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <div className="mt-2 flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-card2"}`}
            />
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-fg">Case type</p>
            <div className="flex flex-wrap gap-1.5">
              {CASE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCaseType(t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    caseType === t ? "bg-brand text-white" : "bg-card2 text-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="text-sm font-medium text-fg">
            Symptom / complaint <span className="text-bad">*</span>
            <textarea
              required
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
              rows={4}
              placeholder="Describe the observed problem... (min 10 chars)"
              className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
            />
            <span className="mt-1 block text-xs text-muted2">
              Never collapsed with diagnosis/root cause — just what you observed.
            </span>
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <label className="text-sm font-medium text-fg">
            Area (optional)
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
            />
          </label>
          <label className="text-sm font-medium text-fg">
            Line (optional)
            <input
              value={line}
              onChange={(e) => setLine(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
            />
          </label>
          <label className="text-sm font-medium text-fg">
            Shift (optional)
            <input
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              placeholder="A / B / C"
              className="mt-1 block w-full rounded-lg border border-line2 px-3 py-2 text-base"
            />
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={assetKnown}
              onChange={(e) => setAssetKnown(e.target.checked)}
            />
            Exact asset/machine is known (link it after acknowledgement)
          </label>
          {/* §5.1 intake minimum: "major/complex indication". §24 marks this
              classification HUMAN REQUIRED at complaint creation — a plain
              checkbox, not an algorithmic guess. */}
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={majorComplex}
              onChange={(e) => setMajorComplex(e.target.checked)}
            />
            This is a major / complex case
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3.5 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted2">Case type</p>
            <p className="text-fg">{caseType}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted2">Symptom</p>
            <p className="text-fg">{symptom}</p>
          </div>
          {(area || line || shift) && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted2">Where</p>
              <p className="text-fg">
                {[area, line, shift && `Shift ${shift}`].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {assetKnown && (
              <span className="rounded-full bg-card2 px-2 py-0.5 text-[10px] text-muted">
                Asset known
              </span>
            )}
            {majorComplex && (
              <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[10px] text-red-300">
                MAJOR/COMPLEX
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={back} disabled={submitting}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next} className="flex-1">
            Next
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={submitting} className="flex-1">
            {submitting ? "Submitting…" : "Submit case"}
          </Button>
        )}
      </div>
    </div>
  );
}
