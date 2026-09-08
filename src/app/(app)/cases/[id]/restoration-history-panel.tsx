import type { Restoration } from "@/lib/supabase/database.types";

// Loop 22: §10 — nothing on this page ever showed a case's restoration
// history before now, TEMPORARY restorations least of all (the only prior
// restoration query on this page was the single pending-TECHNICAL-
// verification lookup). This is read-only and purely presentational — no
// "use client" needed, so it's a plain server component like StatCard.
export default function RestorationHistoryPanel({
  restorations,
}: {
  restorations: Restoration[];
}) {
  if (restorations.length === 0) return null;

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3"
      data-testid="restoration-history-panel"
    >
      <h2 className="text-sm font-semibold text-fg">Restoration history</h2>
      <ul className="flex flex-col gap-1.5">
        {restorations.map((r) => (
          <li key={r.id} className="rounded-lg border border-line p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  r.restoration_type === "TEMPORARY"
                    ? "bg-orange/10 text-orange-300"
                    : "bg-brand/10 text-sky-300"
                }`}
              >
                {r.restoration_type === "TEMPORARY" ? "Temporary" : "Technical"}
              </span>
              {r.follow_up_required && (
                <span className="rounded bg-warn/10 px-1.5 py-0.5 text-xs font-medium text-amber-300">
                  Permanent-repair follow-up generated (§10)
                </span>
              )}
              {r.verification_result && (
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    r.verification_result === "PASSED"
                      ? "bg-good/10 text-emerald-300"
                      : "bg-bad/10 text-red-300"
                  }`}
                >
                  Verification {r.verification_result}
                </span>
              )}
              <span className="text-xs text-muted2">
                {new Date(r.recorded_at).toLocaleString()}
              </span>
            </div>
            {r.details && <p className="mt-1 text-fg">{r.details}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
