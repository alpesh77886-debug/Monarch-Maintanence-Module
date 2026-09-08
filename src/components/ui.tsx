// Shared presentational primitives — Button/Badge/StatusBadge/Card — so
// every panel across the app draws from one consistent design language
// instead of each file inventing its own ad hoc color/radius/padding. Pure
// styling: no business logic lives here, and every prop a caller already
// passes through (onClick, disabled, type, etc.) is forwarded untouched. No
// "use client" needed — these render no interactivity of their own, so a
// server component can render a <Button> directly (the Loop 16 boundary
// lesson: this file has no client-only export to trip on).
//
// Loop 50 (§30 visual layer): restyled to the MONARCH design language
// (dark surface stack, tinted-pill badges, gradient/glow buttons) adopted
// from the Boss's two reference apps (AOS, Quality) rather than invented —
// see globals.css's token comment. StatusBadge is new: it replaces three
// separate, inconsistent case-status color maps that existed across
// cases/page.tsx, dashboard/page.tsx, and cases/[id]/page.tsx (the last of
// which hardcoded every status to the same blue tone — SARVAM_VERIFICATION_
// REPORT.md finding 1c) with one canonical source every screen now shares.

import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import type { CaseStatus } from "@/lib/supabase/database.types";

export type ButtonVariant = "primary" | "secondary" | "danger" | "warning" | "success" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-brand to-brand2 text-white shadow-[0_4px_14px_rgba(59,130,246,0.35)] hover:brightness-110 focus-visible:outline-brand disabled:opacity-40 disabled:shadow-none",
  secondary:
    "border border-line2 bg-white/[0.04] text-fg hover:bg-white/[0.08] focus-visible:outline-muted disabled:opacity-40",
  danger:
    "bg-gradient-to-br from-bad to-red-700 text-white shadow-[0_4px_14px_rgba(239,68,68,0.35)] hover:brightness-110 focus-visible:outline-bad disabled:opacity-40 disabled:shadow-none",
  warning:
    "bg-gradient-to-br from-warn to-orange-600 text-white shadow-[0_4px_14px_rgba(245,158,11,0.35)] hover:brightness-110 focus-visible:outline-warn disabled:opacity-40 disabled:shadow-none",
  success:
    "bg-gradient-to-br from-good to-emerald-700 text-white shadow-[0_4px_14px_rgba(34,197,94,0.35)] hover:brightness-110 focus-visible:outline-good disabled:opacity-40 disabled:shadow-none",
  ghost:
    "text-muted hover:bg-white/[0.06] hover:text-fg focus-visible:outline-muted disabled:opacity-40",
};

// Loop 48 (§30 mobile-first UX, §32 item 21). "md" is the default/primary
// action size across the app — every "Save", "Acknowledge", "Submit" button
// on the primary operating surface — so it gets the ~48px minimum touch
// target §30 asks for (min-h-12 = 3rem = 48px). "sm" stays compact on
// purpose: it is the deliberately smaller size for secondary/inline actions
// (26 call sites — badges-with-actions, table-row buttons), not the primary
// tap target the guideline is about, and enlarging it would make already-
// dense rows (e.g. spares-panel's request list) worse, not better.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "min-h-12 px-4 py-2 text-sm",
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = "") {
  return `${BASE} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`.trim();
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}) {
  return (
    <a className={buttonClass(variant, size, className)} {...props}>
      {children}
    </a>
  );
}

// Generic (non-lifecycle) tone badge — for anything that isn't a case
// status: role labels, boolean flags, misc. category tags.
const BADGE_TONES = {
  neutral: "bg-white/[0.06] text-muted border border-line2",
  info: "bg-brand/15 text-sky-300 border border-brand/25",
  warn: "bg-warn/15 text-amber-300 border border-warn/25",
  danger: "bg-bad/15 text-red-300 border border-bad/25",
  success: "bg-good/15 text-emerald-300 border border-good/25",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${BADGE_TONES[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

// Canonical case-lifecycle status → colour map. This is the single source
// every screen (queue cards, dashboard chart, case detail header) should
// import from, rather than each maintaining its own partial/divergent copy.
// Colour intent follows the Sarvam Screen Architecture's own DR-05 proposal
// (§8 state badges): rose = needs triage/rejected-back, amber = active
// diagnosis/waiting, violet = in-repair, teal = restored, green = released,
// grey = terminal/inert.
const STATUS_TONE: Record<CaseStatus, "rose" | "amber" | "brand" | "violet" | "teal" | "green" | "muted"> = {
  REPORTED: "rose",
  ACKNOWLEDGED: "amber",
  NEEDS_INFORMATION: "amber",
  ASSESSED: "brand",
  ASSIGNED: "brand",
  DIAGNOSING: "violet",
  IN_REPAIR: "violet",
  TEMPORARILY_RESTORED: "teal",
  TECHNICALLY_RESTORED: "teal",
  CLEARANCE_PENDING: "amber",
  QC_REJECTED: "rose",
  MAINTENANCE_RELEASED: "green",
  CLOSED: "muted",
  REOPENED: "rose",
  DUPLICATE: "muted",
  REJECTED: "muted",
};

const STATUS_TONE_CLASSES: Record<(typeof STATUS_TONE)[CaseStatus], string> = {
  rose: "bg-bad/15 text-red-300 border border-bad/25",
  amber: "bg-warn/15 text-amber-300 border border-warn/25",
  brand: "bg-brand/15 text-sky-300 border border-brand/25",
  violet: "bg-vio/15 text-purple-300 border border-vio/25",
  teal: "bg-teal/15 text-teal-300 border border-teal/25",
  green: "bg-good/15 text-emerald-300 border border-good/25",
  muted: "bg-white/[0.06] text-muted border border-line2",
};

export function statusBadgeClass(status: CaseStatus, className = "") {
  const tone = STATUS_TONE[status] ?? "muted";
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${STATUS_TONE_CLASSES[tone]} ${className}`.trim();
}

// Solid-fill variant of the same canonical map — for a bar-chart segment or
// any other use that needs a plain background colour rather than a tinted
// pill. Same STATUS_TONE lookup as statusBadgeClass, so the queue card, the
// case-detail header, and the dashboard chart can never drift into three
// different colour opinions again.
const STATUS_TONE_FILL: Record<(typeof STATUS_TONE)[CaseStatus], string> = {
  rose: "bg-bad",
  amber: "bg-warn",
  brand: "bg-brand",
  violet: "bg-vio",
  teal: "bg-teal",
  green: "bg-good",
  muted: "bg-line2",
};

export function statusFillClass(status: CaseStatus): string {
  return STATUS_TONE_FILL[STATUS_TONE[status] ?? "muted"];
}

export function StatusBadge({ status, className = "" }: { status: CaseStatus; className?: string }) {
  return <span className={statusBadgeClass(status, className)}>{status.replace(/_/g, " ")}</span>;
}

// A consistent card shell used by list rows and panels — dark surface,
// hairline border, a soft two-layer shadow for depth (the reference apps'
// "close shadow + diffuse far shadow" recipe), and a hover lift for
// clickable rows.
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-line2 bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.3),0_4px_16px_rgba(0,0,0,0.2)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}

// Loop 67 (design-system primitives, Prompt §44 "Performance/perceived
// performance"): a plain pulsing block, the one building block every
// route's loading.tsx composes into a shape matching that route's real
// content (a list of cards, a header line, etc.) — never a generic spinner,
// which the Prompt explicitly treats as the weaker signal since it can't
// hint at the coming layout.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/[0.06] ${className}`.trim()} />;
}

// A skeleton shaped like one of this app's list-row Cards (case/spare/PM
// row) — every route's loading.tsx composes N of these rather than
// hand-drawing bars, so the loading shape always matches the Card it is
// standing in for.
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-line2 bg-card p-4 ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}

// Loop 67: the one dashed-border "nothing here" notice every list page
// (Spares/Emergency/My Work/More/PM, and the staff-only gates on each) was
// already converging on independently, with small drifts in padding/radius
// between them. One shared component so that drift stops happening and any
// future visual change to it happens once.
export function EmptyState({
  title,
  hint,
  className = "",
}: {
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-line2 p-8 text-center ${className}`.trim()}
    >
      <p className="text-sm text-muted">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted2">{hint}</p>}
    </div>
  );
}
