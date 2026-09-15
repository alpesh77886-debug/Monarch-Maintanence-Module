"use client";

import { useState } from "react";
import Link from "next/link";
import type { AppNotification, CaseType, Priority } from "@/lib/supabase/database.types";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import SignOutButton from "../(app)/sign-out-button";
import NotificationBell from "../(app)/notification-bell";
import { Badge, EmptyState } from "@/components/ui";
import { StatCard, Icons } from "@/components/stat-card";

// Loop 115 (Boss: "Technician ka alag screen banega... Total 3 screens...
// Maintenance Manager, Maintenance Executive aur Technician" — the Premium
// UI v2 mockup's screens 5-8). Pack §3.1 locks exactly 2 software roles and
// explicitly rules out a third "Technician" software role, so this is not a
// new authority boundary — it is a dedicated, mobile-first workspace for the
// identity the pack already tracks by name (`case_assignments.
// technician_user_id`, `interventions.technician_user_id`), replacing the
// bare list Loop 109 first surfaced. "Record Intervention" (mockup screen 6)
// and "Quick Spare Request" (mockup screen 8) are NOT rebuilt here: both
// already exist as tested, RLS/RPC-backed forms on the case detail page
// (`intervention-form.tsx`, `spares-panel.tsx`) — this screen deep-links
// straight into them (`/cases/[id]?tab=...`) instead of duplicating that
// business logic on a second surface, which is exactly the kind of drift
// CLAUDE.md's "no second source of truth" rule warns against.
//
// Every number on this screen is a real query result computed in
// `page.tsx` (active-assignment counts, closed-this-week counts, average of
// actual `closed_at - assigned_at` gaps) — none of it is fabricated to match
// the mockup's own placeholder figures. Two mockup fields were deliberately
// dropped rather than faked: "On Shift · A-Shift" (staff-only `is_available`
// column, this identity has no `staff` row per §3.1) and per-task spare
// cost on the Done list (would need a second per-case spare-request sum
// query for a number Spares already shows elsewhere — left out this loop,
// not invented).

export type TechTask = {
  id: string;
  case_number: string;
  case_type: CaseType;
  status: string;
  priority: Priority | null;
  area: string | null;
  line: string | null;
  symptom: string;
  emergency_confirmed: boolean;
  assigned_at: string;
};

export type TechCompletion = {
  id: string;
  case_number: string;
  case_type: CaseType;
  symptom: string;
  area: string | null;
  line: string | null;
  closed_at: string;
  fix_hours: number | null;
};

type TechStats = {
  myTasks: number;
  emergency: number;
  doneThisWeek: number;
  avgFixHours: number | null;
};

const PRIORITY_DOT: Record<string, string> = {
  HIGH: "bg-bad",
  MEDIUM: "bg-warn",
  LOW: "bg-good",
};

const CASE_TYPE_LABEL: Record<CaseType, string> = {
  BREAKDOWN: "Breakdown",
  PREVENTIVE: "Preventive",
  CORRECTIVE: "Corrective",
  INSPECTION: "Inspection",
  CALIBRATION: "Calibration",
  PLANNED_REPLACEMENT: "Planned Replacement",
  MODIFICATION_IMPROVEMENT: "Modification/Improvement",
  TRIAL_SUPPORT: "Trial Support",
};

function formatAge(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// Bucket completions by weekday for the small "My Output" bar row —
// consistent with StatCard/BarBreakdown's own rule (`stat-card.tsx`): only
// ever render counts the caller already computed from real rows, no target
// or threshold line implied.
function weeklyBuckets(completions: TechCompletion[]): { label: string; count: number }[] {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const days: { label: string; count: number; key: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ label: labels[d.getDay()], count: 0, key: d.toDateString() });
  }
  for (const c of completions) {
    const key = new Date(c.closed_at).toDateString();
    const bucket = days.find((d) => d.key === key);
    if (bucket) bucket.count += 1;
  }
  return days.map(({ label, count }) => ({ label, count }));
}

export default function TechnicianHome({
  userLabel,
  notifications,
  activeTasks,
  completions,
  stats,
}: {
  userLabel: string;
  notifications: AppNotification[];
  activeTasks: TechTask[];
  completions: TechCompletion[];
  stats: TechStats;
}) {
  const [view, setView] = useState<"tasks" | "done">("tasks");
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  const topTask = activeTasks[0] ?? null;
  const quickActions: { icon: string; label: string; tab: string }[] = [
    { icon: "🔧", label: "Record Fix", tab: "interventions" },
    { icon: "📝", label: "Add Note", tab: "journal" },
    { icon: "📦", label: "Request Spare", tab: "spares" },
    { icon: "📸", label: "Add Photo", tab: "evidence" },
  ];

  const buckets = weeklyBuckets(completions);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="min-h-screen bg-bg2">
      <header
        className="sticky top-0 z-30 flex h-14 items-center justify-between px-4 text-white shadow-[0_8px_24px_rgba(20,184,166,0.2)]"
        style={{ background: "linear-gradient(135deg,#0f9f8e,#13b981)" }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-sm font-bold backdrop-blur">
            M
          </span>
          <span className="text-sm font-semibold">MONARCH</span>
          <span className="ml-1 rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
            Tech
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell notifications={notifications} />
          <button
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="flex h-8 w-8 flex-col items-center justify-center gap-[3px] rounded-lg border border-white/20 bg-white/10"
          >
            <span className="block h-[2px] w-4 rounded bg-white" />
            <span className="block h-[2px] w-4 rounded bg-white" />
            <span className="block h-[2px] w-4 rounded bg-white" />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-24 pt-4 lg:max-w-4xl xl:max-w-5xl">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-teal">
            Technician workspace
          </p>
          <h1 className="mt-1 text-xl font-bold text-fg">{userLabel}</h1>
          <p className="mt-1 text-xs text-muted">Your assigned tasks and this week&rsquo;s completed work.</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard label="My Tasks" value={stats.myTasks} icon={Icons.clipboard} tone="info" />
          <StatCard label="Emergency" value={stats.emergency} icon={Icons.warning} tone="danger" />
          <StatCard label="Done (Week)" value={stats.doneThisWeek} icon={Icons.check} tone="success" />
          <StatCard label="Avg Fix Time" value={formatHours(stats.avgFixHours)} icon={Icons.clock} tone="warn" />
        </div>

        <section>
          <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
            Quick actions
          </h2>
          {topTask ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {quickActions.map((qa) => (
                <Link
                  key={qa.tab}
                  href={`/cases/${topTask.id}?tab=${qa.tab}`}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-card p-3 text-center shadow-sm active:scale-[0.98]"
                >
                  <span className="text-lg">{qa.icon}</span>
                  <span className="text-[11px] font-semibold text-fg">{qa.label}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No active task assigned yet." hint="Quick actions unlock once you have an assigned case." />
          )}
          {topTask && (
            <p className="mt-1.5 text-[10px] text-muted2">
              Acting on your most urgent task: {topTask.case_number}
            </p>
          )}
        </section>

        <div className="flex gap-1 rounded-xl border border-line bg-card p-1">
          <button
            type="button"
            onClick={() => setView("tasks")}
            className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
              view === "tasks" ? "bg-teal text-white" : "text-muted"
            }`}
          >
            My Tasks ({activeTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setView("done")}
            className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
              view === "done" ? "bg-teal text-white" : "text-muted"
            }`}
          >
            Done ({completions.length})
          </button>
        </div>

        {view === "tasks" ? (
          <section>
            {activeTasks.length === 0 ? (
              <EmptyState title="No case is currently assigned to you." />
            ) : (
              <ul className="flex flex-col gap-2">
                {activeTasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/cases/${t.id}`}
                      className={`block rounded-xl border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2 ${
                        t.emergency_confirmed ? "border-bad/40" : "border-line"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-muted">{t.case_number}</span>
                          <span className="text-[10px] text-muted2">{CASE_TYPE_LABEL[t.case_type]}</span>
                        </div>
                        {t.emergency_confirmed ? (
                          <Badge tone="danger">Emergency</Badge>
                        ) : (
                          <span className="rounded-full bg-card2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                            {t.status.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-fg">{t.symptom}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        {t.priority && (
                          <span className="flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[t.priority] ?? "bg-muted2"}`} />
                            {t.priority}
                          </span>
                        )}
                        {(t.area || t.line) && <span>{[t.area, t.line].filter(Boolean).join(" · ")}</span>}
                        <span className="ml-auto font-mono text-[10px]">{formatAge(t.assigned_at)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="flex flex-col gap-3">
            <div className="rounded-xl border border-line bg-card p-3.5">
              <p className="text-xs font-medium text-muted">My Output <span className="text-muted2">Last 7 days</span></p>
              <div
                role="img"
                aria-label={`Completions per day: ${buckets.map((b) => `${b.label} ${b.count}`).join(", ")}`}
                className="mt-3 flex items-end justify-between gap-1.5"
                style={{ height: 68 }}
              >
                {buckets.map((b) => (
                  <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full max-w-[22px] rounded-t bg-gradient-to-t from-teal2 to-teal"
                      style={{ height: Math.max(2, Math.round((b.count / maxBucket) * 48)) }}
                      title={`${b.label}: ${b.count}`}
                    />
                    <span className="text-[9px] text-muted2">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {completions.length === 0 ? (
              <EmptyState title="No case closed in the last 7 days." hint="Completed work you were assigned to will appear here." />
            ) : (
              <ul className="flex flex-col gap-2">
                {completions.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/cases/${c.id}`}
                      className="block rounded-xl border border-line bg-card p-3.5 opacity-90 shadow-sm transition-shadow hover:shadow-md active:bg-bg2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-muted">{c.case_number}</span>
                          <span className="text-[10px] text-muted2">{CASE_TYPE_LABEL[c.case_type]}</span>
                        </div>
                        <span className="rounded-full bg-card2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          Closed
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-fg">{c.symptom}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        {(c.area || c.line) && <span>{[c.area, c.line].filter(Boolean).join(" · ")}</span>}
                        <span>Fix time: {formatHours(c.fix_hours)}</span>
                        <span className="ml-auto font-mono text-[10px]">{formatAge(c.closed_at)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {menuOpen && (
        <div className="fixed inset-0 z-40 flex">
          <button
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="flex-1 bg-black/50"
          />
          <div className="flex h-full w-[84%] max-w-xs flex-col overflow-y-auto border-r border-line bg-bg1 shadow-2xl">
            <div className="p-4 text-white" style={{ background: "linear-gradient(145deg,#0f9f8e,#0e786f)" }}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-xs font-bold">
                  {userLabel
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-bold">{userLabel}</p>
                  <p className="mt-0.5 text-[10px] opacity-80">Technician</p>
                </div>
              </div>
            </div>
            <div className="flex-1 p-2">
              <button
                onClick={toggleTheme}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left hover:bg-white/5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm text-teal">◐</span>
                <span>
                  <span className="block text-[11px] font-semibold text-fg">Theme Setting</span>
                  <span className="mt-0.5 block text-[9px] text-muted2">
                    Currently {theme === "dark" ? "dark" : "light"} — tap to switch
                  </span>
                </span>
              </button>
              <div className="my-2 h-px bg-line" />
              <div className="px-2 py-2">
                <SignOutButton />
              </div>
            </div>
            <p className="px-4 pb-4 text-[9px] leading-relaxed text-muted2">
              Case and task data on this screen come from your authenticated session — nothing here is
              hardcoded.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
