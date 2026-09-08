// Shared presentational primitives — Button/Badge/IconButton — so every
// panel across the app draws from one consistent design language instead of
// each file inventing its own ad hoc color/radius/padding. Pure styling: no
// business logic lives here, and every prop a caller already passes through
// (onClick, disabled, type, etc.) is forwarded untouched. No "use client"
// needed — these render no interactivity of their own, so a server
// component can render a <Button> directly (the Loop 16 boundary lesson:
// this file has no client-only export to trip on).

import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "warning" | "success" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-indigo-600 disabled:bg-indigo-300",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-slate-400 disabled:text-slate-400 disabled:bg-slate-50",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:outline-red-600 disabled:bg-red-300",
  warning:
    "bg-amber-600 text-white shadow-sm hover:bg-amber-500 focus-visible:outline-amber-600 disabled:bg-amber-300",
  success:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-emerald-600 disabled:bg-emerald-300",
  ghost:
    "text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400 disabled:text-slate-300",
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
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed";

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

const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-sky-100 text-sky-700",
  warn: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
  success: "bg-emerald-100 text-emerald-700",
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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

// A consistent card shell used by list rows and panels — rounded-xl instead
// of the previous rounded-lg, a hairline border, and a hover lift for
// clickable rows, matching the reference dashboards' card language.
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`.trim()}>
      {children}
    </div>
  );
}
