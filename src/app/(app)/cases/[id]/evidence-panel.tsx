"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CaseEvidence } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

// §5.1 / §26 — evidence attachment/reference.
//
// `maintenance.evidence` has existed since Loop 1 with its own RLS already
// correct: unlike every other audit-sensitive table in this schema, it is
// NOT gated behind an RPC — `evidence_insert` allows any authenticated user
// to attach evidence to a case directly, with only `uploaded_by = auth.uid()`
// enforced, the same shape as `cases_insert` (reporting a case is itself a
// direct insert, no RPC). That is deliberate: §5.1 lists evidence as an
// intake field, so the reporter — not just staff — needs to be able to
// attach it, potentially before any staff RPC has touched the case at all.
// This panel is a thin client over that existing, correct policy — nothing
// here changes authorization.
//
// `file_ref` is a REFERENCE, not an uploaded file. Building real file/photo
// upload would mean Supabase Storage buckets, MIME handling, and a security
// review of their own — none of that is asked for by the locked pack, and
// every other "reference" seam in this app (PTW proof, evidence linked to a
// spare approval) is the same: a text pointer to where the real evidence
// lives (a URL, a filed photo reference, a report number), not a document
// this app stores itself.
export default function EvidencePanel({
  caseId,
  records,
  nameById,
}: {
  caseId: string;
  records: CaseEvidence[];
  nameById: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileRef, setFileRef] = useState("");
  const [description, setDescription] = useState("");

  const sorted = [...records].sort((a, b) => b.created_at.localeCompare(a.created_at));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      setError("Not signed in.");
      return;
    }

    const { error } = await supabase.from("evidence").insert({
      case_id: caseId,
      uploaded_by: user.id,
      file_ref: fileRef,
      description: description || null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setFileRef("");
    setDescription("");
    router.refresh();
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="evidence-panel"
    >
      <h2 className="text-sm font-semibold text-slate-900">Evidence (§5.1)</h2>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500">No evidence attached yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sorted.map((e) => (
            <li key={e.id} className="rounded-md border border-slate-200 p-2 text-sm">
              {/^https?:\/\//i.test(e.file_ref) ? (
                <a
                  href={e.file_ref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-indigo-700 underline"
                >
                  {e.file_ref}
                </a>
              ) : (
                <p className="break-all font-medium text-slate-800">{e.file_ref}</p>
              )}
              {e.description && (
                <p className="mt-0.5 text-slate-600">{e.description}</p>
              )}
              <p className="mt-0.5 text-xs text-slate-400">
                {nameById[e.uploaded_by] ?? "unknown"} · {new Date(e.created_at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex flex-col gap-2">
        <label className="text-xs text-slate-600">
          Evidence reference
          <input
            value={fileRef}
            onChange={(e) => setFileRef(e.target.value)}
            placeholder="a link, photo reference, or report number"
            className="mt-0.5 w-full rounded-md border border-slate-300 p-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Description (optional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="what this shows"
            className="mt-0.5 w-full rounded-md border border-slate-300 p-1.5 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button size="sm" type="submit" className="self-start" disabled={submitting || !fileRef.trim()}>
          Attach evidence
        </Button>
      </form>
    </section>
  );
}
