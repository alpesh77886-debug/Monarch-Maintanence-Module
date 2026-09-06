"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CaseAsset } from "@/lib/supabase/database.types";

// §5.1: "Exact asset may be unknown at creation. Never silently map an
// unknown asset. A case may later be linked to one or more assets/machines."
//
// This is a deliberate, staff-entered link — never a guess. There is no
// "suggested asset" autofill here and nothing pre-selects one from the
// symptom text; that would be exactly the kind of silent mapping §5.1
// forbids. Linking an asset also flips `cases.asset_known` server-side (a
// database trigger, not this component) so the flag stays honest about data
// that now exists elsewhere on the same case.
export default function AssetPanel({
  caseId,
  assets,
}: {
  caseId: string;
  assets: CaseAsset[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [assetRef, setAssetRef] = useState("");

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

    const { error } = await supabase.from("case_assets").insert({
      case_id: caseId,
      asset_name: assetName,
      asset_ref: assetRef || null,
      linked_by: user.id,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAssetName("");
    setAssetRef("");
    router.refresh();
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3"
      data-testid="asset-panel"
    >
      <h2 className="text-sm font-semibold text-slate-900">Asset / machine (§5.1)</h2>

      {assets.length === 0 ? (
        <p className="text-sm text-slate-500">
          No asset linked yet. Link one once it&rsquo;s identified — never
          guess it from the symptom.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {assets.map((a) => (
            <li key={a.id} className="rounded-md border border-slate-200 p-2 text-sm">
              <p className="font-medium text-slate-800">{a.asset_name}</p>
              {a.asset_ref && <p className="text-xs text-slate-500">Ref: {a.asset_ref}</p>}
              <p className="text-xs text-slate-400">{new Date(a.linked_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex flex-col gap-2">
        <label className="text-xs text-slate-600">
          Asset / machine name
          <input
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            placeholder="e.g. Conveyor Motor 7"
            className="mt-0.5 w-full rounded-md border border-slate-300 p-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Asset reference (optional)
          <input
            value={assetRef}
            onChange={(e) => setAssetRef(e.target.value)}
            placeholder="asset tag / ID if known"
            className="mt-0.5 w-full rounded-md border border-slate-300 p-1.5 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !assetName.trim()}
          className="self-start rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Link asset
        </button>
      </form>
    </section>
  );
}
