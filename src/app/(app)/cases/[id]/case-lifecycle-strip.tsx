import type { CaseStatus } from "@/lib/supabase/database.types";

// Loop 65 (Prompt §9 "Lifecycle visualization", §22 "Next Action Engine"):
// a compact, read-only view of the locked transition graph
// (IMPLEMENTATION_PACK.md §4) — display only, never a second source of
// truth. The happy-path condenses adjacent real statuses into one step
// (e.g. TEMPORARILY_RESTORED/TECHNICALLY_RESTORED -> "Restoration") purely
// for a mobile-width strip; it never implies a transition that doesn't
// exist. Exception/branch statuses (NEEDS_INFORMATION, REOPENED, DUPLICATE,
// REJECTED) are real locked states but aren't on the linear happy path, so
// they're shown as a distinct callout instead of force-fit onto the strip.
const HAPPY_PATH: { label: string; statuses: CaseStatus[] }[] = [
  { label: "Reported", statuses: ["REPORTED"] },
  { label: "Acknowledged", statuses: ["ACKNOWLEDGED"] },
  { label: "Assessed", statuses: ["ASSESSED"] },
  { label: "Assigned", statuses: ["ASSIGNED"] },
  { label: "Diagnosing", statuses: ["DIAGNOSING"] },
  { label: "In Repair", statuses: ["IN_REPAIR"] },
  { label: "Restoration", statuses: ["TEMPORARILY_RESTORED", "TECHNICALLY_RESTORED"] },
  { label: "QC", statuses: ["CLEARANCE_PENDING", "QC_REJECTED"] },
  { label: "Release", statuses: ["MAINTENANCE_RELEASED"] },
  { label: "Closed", statuses: ["CLOSED"] },
];

const EXCEPTION_LABELS: Partial<Record<CaseStatus, string>> = {
  NEEDS_INFORMATION: "Needs information from reporter",
  REOPENED: "Reopened",
  DUPLICATE: "Marked duplicate",
  REJECTED: "Rejected — false complaint",
};

export default function CaseLifecycleStrip({ status }: { status: CaseStatus }) {
  const currentIndex = HAPPY_PATH.findIndex((step) => step.statuses.includes(status));
  const exceptionLabel = EXCEPTION_LABELS[status];

  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="scrollbar-none flex items-center gap-1 overflow-x-auto">
        {HAPPY_PATH.map((step, i) => {
          const isCurrent = i === currentIndex;
          const isPast = currentIndex >= 0 && i < currentIndex;
          return (
            <div key={step.label} className="flex shrink-0 items-center gap-1">
              <span
                className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium ${
                  isCurrent
                    ? "bg-brand text-white"
                    : isPast
                      ? "bg-good/15 text-emerald-300"
                      : "bg-card2 text-muted2"
                }`}
              >
                {step.label}
              </span>
              {i < HAPPY_PATH.length - 1 && <span className="text-muted2">→</span>}
            </div>
          );
        })}
      </div>
      {exceptionLabel && (
        <p className="mt-2 text-xs font-medium text-amber-300">
          Current: {exceptionLabel} — off the standard path shown above
        </p>
      )}
    </div>
  );
}
