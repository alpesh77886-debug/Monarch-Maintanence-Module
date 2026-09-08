"use client";

import { useState } from "react";
import Link from "next/link";
import type { AppNotification, StaffRole } from "@/lib/supabase/database.types";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import SignOutButton from "../(app)/sign-out-button";
import NotificationBell from "../(app)/notification-bell";

type Counts = {
  openCases: number;
  myWork: number;
  pmOverdue: number;
  spareApprovalPending: number;
  activeEmergency: number;
};

const ROLE_LABEL: Record<StaffRole, string> = {
  MAINTENANCE_EXECUTIVE: "Maintenance Executive",
  MAINTENANCE_MANAGER: "Maintenance Manager",
};

type ModuleTile = {
  href: string;
  icon: string;
  title: string;
  meta: string;
  badge?: number;
  tone?: "alert" | "primary";
};

export default function HomeClient({
  userLabel,
  role,
  isAvailable,
  counts,
  notifications,
  isStaff,
}: {
  userLabel: string;
  role: StaffRole | null;
  isAvailable: boolean;
  counts: Counts;
  notifications: AppNotification[];
  isStaff: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  // Staff-only modules mirror AppNav's own `{isStaff && <AppNav />}` gating —
  // a non-staff identity (e.g. the demo "technician" login) sees only Cases,
  // never a PM/Spares/My Work/Emergency tile it has no data access to.
  const tiles: ModuleTile[] = isStaff
    ? [
        { href: "/cases", icon: "▤", title: "Cases", meta: "Report, track & manage maintenance cases", badge: counts.openCases },
        { href: "/dashboard", icon: "◷", title: "Shift", meta: "Shift status, handover & continuity" },
        { href: "/pm", icon: "▣", title: "PM", meta: "Plans, calendar & preventive work", badge: counts.pmOverdue > 0 ? counts.pmOverdue : undefined },
        { href: "/spares", icon: "◆", title: "Spare Consumption", meta: "Requests, approvals & usage trace", badge: counts.spareApprovalPending > 0 ? counts.spareApprovalPending : undefined },
        { href: "/my-work", icon: "✓", title: "My Work", meta: "Your assigned cases", badge: counts.myWork > 0 ? counts.myWork : undefined, tone: "primary" },
        { href: "/emergency", icon: "!", title: "Emergency", meta: "Active emergency actions requiring attention", badge: counts.activeEmergency > 0 ? counts.activeEmergency : undefined, tone: "alert" },
      ]
    : [{ href: "/cases", icon: "▤", title: "Cases", meta: "Report and track maintenance cases" }];

  return (
    <div className="min-h-screen bg-bg2">
      <header
        className="sticky top-0 z-30 flex h-14 items-center justify-between px-4 text-white shadow-[0_8px_24px_rgba(16,185,129,0.2)]"
        style={{ background: "linear-gradient(135deg,#0f9f8e,#13b981)" }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/15 text-sm font-bold backdrop-blur">
            M
          </span>
          <span className="text-sm font-semibold">MONARCH</span>
        </div>
        <div className="flex items-center gap-2">
          {isStaff && <NotificationBell notifications={notifications} />}
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

      {/* Loop 70 (§16 "Responsive Model"): wider max-width + a third tile
          column at lg: — desktop gets real information density instead of
          a mobile-width hub centered in empty space. */}
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-10 pt-4 lg:max-w-4xl xl:max-w-5xl">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-teal">
              Maintenance workspace
            </p>
            <h1 className="mt-1 text-xl font-bold text-fg">Good day, {userLabel}</h1>
            <p className="mt-1 text-xs text-muted">
              Your work is organised around today&rsquo;s active shift and timeline.
            </p>
          </div>
          {isStaff && (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                isAvailable
                  ? "border-good/25 bg-good/10 text-emerald-400"
                  : "border-line2 bg-card2 text-muted"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isAvailable ? "bg-good shadow-[0_0_8px_rgba(34,197,94,0.8)]" : "bg-muted2"}`} />
              {isAvailable ? "ON SHIFT" : "OFF SHIFT"}
            </span>
          )}
        </div>

        {!isStaff && (
          <p className="rounded-xl border border-dashed border-line2 bg-card p-4 text-sm text-muted">
            You&rsquo;re signed in, but this identity has no Maintenance staff record — module
            access below is limited. Contact a Manager if this is unexpected.
          </p>
        )}

        <section>
          <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
            Core workspace
          </h2>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
            {tiles.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                aria-label={tile.title}
                className={`group relative min-h-[105px] rounded-2xl border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98] ${
                  tile.tone === "alert"
                    ? "border-bad/25"
                    : tile.tone === "primary"
                      ? "border-brand/30"
                      : "border-line"
                }`}
              >
                {typeof tile.badge === "number" && (
                  <span
                    className={`absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold ${
                      tile.tone === "alert" ? "bg-bad text-white" : "bg-brand text-white"
                    }`}
                  >
                    {tile.badge}
                  </span>
                )}
                <div
                  className={`mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl border text-lg font-bold ${
                    tile.tone === "alert"
                      ? "border-bad/20 bg-bad/10 text-red-400"
                      : "border-line bg-card2 text-teal"
                  }`}
                >
                  {tile.icon}
                </div>
                <p className="text-xs font-bold text-fg">{tile.title}</p>
                <p className="mt-1 text-[10px] leading-tight text-muted">{tile.meta}</p>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
            Quick actions
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            <Link
              href="/cases/new"
              className="flex items-center gap-2.5 rounded-xl border border-line bg-card p-2.5 shadow-sm"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card2 text-sm text-teal">＋</span>
              <span className="text-[11px] font-bold text-fg">Report Case</span>
            </Link>
            <Link
              href="/cases"
              className="flex items-center gap-2.5 rounded-xl border border-line bg-card p-2.5 shadow-sm"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card2 text-sm text-teal">▤</span>
              <span className="text-[11px] font-bold text-fg">Case Queue</span>
            </Link>
          </div>
        </section>
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
                  <p className="mt-0.5 text-[10px] opacity-80">
                    {role ? ROLE_LABEL[role] : "Signed in"}
                  </p>
                </div>
              </div>
              {isStaff && (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-white/15 bg-black/15 px-2.5 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-wide">Current status</span>
                  <span className="font-mono text-[10px] opacity-90">{isAvailable ? "ON SHIFT" : "OFF SHIFT"}</span>
                </div>
              )}
            </div>

            <div className="flex-1 p-2">
              <p className="px-2 pb-1.5 pt-2.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted2">
                Work
              </p>
              <DrawerLink href="/cases/new" icon="＋" title="Report Cases" sub="Create a new maintenance case" onNavigate={() => setMenuOpen(false)} />
              {isStaff && (
                <>
                  <DrawerLink href="/spares" icon="◆" title="Spare Consumption" sub="Record and trace spare usage" onNavigate={() => setMenuOpen(false)} />
                  <DrawerLink href="/my-work" icon="✓" title="My Work" sub="Assigned work based on your timeline" onNavigate={() => setMenuOpen(false)} />
                  <DrawerLink href="/dashboard" icon="◷" title="Shift / Handover" sub="Current shift, handover and continuity" onNavigate={() => setMenuOpen(false)} />
                </>
              )}

              <div className="my-2 h-px bg-line" />
              <p className="px-2 pb-1.5 pt-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted2">
                Preferences
              </p>
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
              <p className="px-2 pb-1.5 pt-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted2">
                Account
              </p>
              <div className="flex items-center gap-2.5 rounded-lg px-2 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm text-teal">◎</span>
                <span>
                  <span className="block text-[11px] font-semibold text-fg">{userLabel}</span>
                  <span className="mt-0.5 block text-[9px] text-muted2">
                    {role ? ROLE_LABEL[role] : "Logged-in user"} · permissions are server-controlled
                  </span>
                </span>
              </div>
              {isStaff && (
                <div className="flex items-center gap-2.5 rounded-lg px-2 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm text-teal">●</span>
                  <span>
                    <span className="block text-[11px] font-semibold text-fg">On Shift</span>
                    <span className="mt-0.5 block text-[9px] text-muted2">
                      {isAvailable ? "You are available for handovers" : "You are not available for handovers"}
                    </span>
                  </span>
                </div>
              )}
              <div className="px-2 py-2">
                <SignOutButton />
              </div>
            </div>
            <p className="px-4 pb-4 text-[9px] leading-relaxed text-muted2">
              Role, permissions, shift and case data on this menu come from your authenticated
              session — nothing here is hardcoded.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DrawerLink({
  href,
  icon,
  title,
  sub,
  onNavigate,
}: {
  href: string;
  icon: string;
  title: string;
  sub: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-left hover:bg-white/5"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm text-teal">{icon}</span>
      <span>
        <span className="block text-[11px] font-semibold text-fg">{title}</span>
        <span className="mt-0.5 block text-[9px] text-muted2">{sub}</span>
      </span>
    </Link>
  );
}
