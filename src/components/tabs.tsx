"use client";

// Loop 51-52 (§30 visual layer, Sarvam §2/§4 "Case Detail local navigation:
// Overview · Journal · Interventions · Assignments · Spares · Restorations
// · QC · Waiting · Audit · Evidence"). A thin client-side tab switcher: the
// PAGE stays a server component (all 22+ Supabase reads unchanged — see
// cases/[id]/page.tsx's own Loop 37 comment on why they're parallelized),
// and each tab's already-server-rendered JSX is handed in as a prop. React
// allows a client component to receive server-rendered elements as
// children/props and simply show/hide them — no re-fetch, no client-side
// data layer, no change to any panel's own internals or the RPCs they call.
//
// Horizontal scroll on mobile (Sarvam §9: "horizontally scrollable Case
// Detail sub-tabs"), no scrollbar shown, matching the reference apps'
// filter-chip-row treatment (hidden scrollbar, `-webkit-overflow-scrolling:
// touch`). A tab with no content for this case (e.g. no active Waiting)
// still renders — it just shows its own empty state, exactly as it did
// inline before this loop; nothing here decides what's "relevant."
//
// Default export only (plus the CaseTabId type, which is compile-time-only
// and stripped before bundling, so it doesn't carry the same risk) — the
// Loop 16 boundary lesson: a second, non-default *runtime* export in a
// "use client" file consumed by a server component breaks in a way
// tsc/lint/build cannot see.

import { useState, type ReactNode } from "react";

export type CaseTabId =
  | "overview"
  | "journal"
  | "interventions"
  | "assignments"
  | "spares"
  | "restorations"
  | "qc"
  | "waiting"
  | "audit"
  | "evidence";

const TAB_LABELS: Record<CaseTabId, string> = {
  overview: "Overview",
  journal: "Journal",
  interventions: "Interventions",
  assignments: "Assignments",
  spares: "Spares",
  restorations: "Restorations",
  qc: "QC",
  waiting: "Waiting",
  audit: "Audit",
  evidence: "Evidence",
};

export default function CaseDetailTabs({
  tabs,
  defaultTab = "overview",
}: {
  tabs: Partial<Record<CaseTabId, ReactNode>>;
  defaultTab?: CaseTabId;
}) {
  const order = Object.keys(tabs) as CaseTabId[];
  const [active, setActive] = useState<CaseTabId>(order.includes(defaultTab) ? defaultTab : order[0]);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4"
        role="tablist"
        aria-label="Case sections"
      >
        {order.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() => setActive(id)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active === id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tabs[active]}</div>
    </div>
  );
}
