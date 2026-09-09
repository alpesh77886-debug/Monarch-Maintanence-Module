"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CaseEvidence } from "@/lib/supabase/database.types";
import { Button, FormField } from "@/components/ui";
import { formatIst } from "@/lib/format";

// §5.1 / §26 — evidence attachment/reference.
//
// Unlike every other audit-sensitive table in this schema, evidence is NOT
// gated behind an RPC — it is a direct insert, the same shape as
// `cases_insert`. That is deliberate: §5.1 lists evidence as an intake field,
// so the reporter — not just staff — needs to be able to attach it, potentially
// before any staff RPC has touched the case at all. This panel is a thin client
// over that policy; nothing here changes authorization.
//
// This comment used to say the policy was "already correct". It was not
// (RISK-30, Loop 45). The intent above is right, but until 0045 the policy
// enforced only `uploaded_by = auth.uid()` with NO case predicate — so any
// signed-in user could attach evidence to ANY case, including one they could
// not read. Proven live: the non-staff technician identity wrote evidence onto
// MC-009600, a case invisible to them, and could not even see the row
// afterwards — while staff saw it as ordinary attached evidence.
//
// 0045 adds `maintenance.can_read_case(case_id)`, which is exactly the three
// parties the intent names (staff, that case's reporter, an assigned
// technician), so INSERT scope now matches SELECT scope. The intake path this
// panel exists for is unchanged and verified: a non-staff reporter can still
// attach evidence to their own case.
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
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4 shadow-sm"
      data-testid="evidence-panel"
    >
      <h2 className="text-sm font-semibold text-fg">Evidence (§5.1)</h2>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted">No evidence attached yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sorted.map((e) => (
            <li key={e.id} className="rounded-lg border border-line p-2 text-sm">
              {/^https?:\/\//i.test(e.file_ref) ? (
                <a
                  href={e.file_ref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-brand underline"
                >
                  {e.file_ref}
                </a>
              ) : (
                <p className="break-all font-medium text-fg">{e.file_ref}</p>
              )}
              {e.description && (
                <p className="mt-0.5 text-muted">{e.description}</p>
              )}
              <p className="mt-0.5 text-xs text-muted2">
                {nameById[e.uploaded_by] ?? "unknown"} · {formatIst(e.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex flex-col gap-2">
        <FormField label="Evidence reference" required hint="A link, photo reference, or report number.">
          <input
            value={fileRef}
            onChange={(e) => setFileRef(e.target.value)}
            className="w-full rounded-lg border border-line2 p-1.5 text-sm"
          />
        </FormField>
        <FormField label="Description" hint="What this shows.">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-line2 p-1.5 text-sm"
          />
        </FormField>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <Button size="sm" type="submit" className="self-start" disabled={submitting || !fileRef.trim()}>
          Attach evidence
        </Button>
      </form>
    </section>
  );
}
