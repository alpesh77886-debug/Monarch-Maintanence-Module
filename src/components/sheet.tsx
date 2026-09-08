"use client";

// Loop 51 (§30 visual layer, Sarvam DR-02/§4/§9 "Bottom-sheet / modal
// behaviour"): a reusable action-sheet primitive. Sarvam's own proposal —
// lifecycle actions open as a bottom-sheet over Case Detail rather than
// staying permanently inline — is validated by the Boss's own Quality
// app, which already ships exactly this pattern (its "Disposition" wizard
// is a real, shipped bottom-sheet). DR-02 itself stays PROPOSED per the
// Sarvam handoff, not a locked business rule — this component is UI
// plumbing only; every form it wraps keeps its own existing validation,
// RPC call and error handling untouched.
//
// Responsive per Sarvam §9: mobile = full-height bottom-sheet (rounded top
// corners only, slides up from the bottom); tablet/desktop = a centered
// modal. Both breakpoints share one implementation — only the position/
// radius/max-width classes differ, driven by Tailwind's sm: prefix.
//
// Covers the handoff's §F "Modal / sheet behaviour" checklist: preserves
// context (caller passes whatever case data the form needs, unaffected by
// this wrapper), returns to the same screen on close (it's an overlay, not
// a navigation), explicit cancel/dismiss (header × button + backdrop
// click + Escape), focus management (autofocus into the panel on open,
// focus returns to the trigger on close).
//
// Loop 69 (§11 "Action sheet quality bar" — "Do not claim 'full
// accessibility' unless it is actually implemented. Verify keyboard focus
// behavior rather than relying on comments."): this file's own prior
// comment claimed "focus stays trapped via a single tabbable panel root".
// That was not true — verified with a real Playwright keyboard test
// against a throwaway preview (Tab from the sheet's last field landed on a
// BUTTON behind the backdrop, five tabs deep). This component does not
// render in a portal, so nothing stopped Tab/Shift+Tab from walking past
// the dialog into the rest of the page's DOM order. The keydown handler
// below now actually traps Tab: it queries the panel's focusable
// descendants on every Tab press and wraps focus at both ends, rather
// than letting the browser's native tab order carry it out of the dialog.
// Deliberately NOT implemented: per-form unsaved-change detection — the
// forms this wraps are short (2-4 fields) and each already shows its own
// inline validation state; adding generic dirty-tracking would mean
// touching every wrapped form's internals to report dirty state, which is
// out of this loop's scope (structure, not each form's own logic) and a
// real risk to introduce silently in a change this size. Recorded here
// rather than left unstated.
//
// Single default export only (ActionSheetTrigger) — the Loop 16 boundary
// lesson: a second, non-default export in a "use client" file consumed by
// a server component breaks in a way tsc/lint/build cannot see. `Sheet`
// itself is the modal shell but is used only internally, so it stays an
// unexported local component rather than a second named export, exactly
// like app-nav.tsx's own single-default-export convention.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui";

function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) {
        // No focusable descendant — keep focus pinned on the panel root
        // itself rather than letting Tab escape to the page behind it.
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line2 bg-card shadow-[0_24px_60px_rgba(0,0,0,0.5),0_8px_24px_rgba(0,0,0,0.3)] outline-none sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <div className="mx-auto h-1 w-9 shrink-0 rounded-full bg-line2 sm:hidden" aria-hidden="true" />
          <h2 className="hidden text-sm font-semibold text-fg sm:block">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-fg"
          >
            ×
          </button>
        </div>
        <p className="px-4 pt-3 text-sm font-semibold text-fg sm:hidden">{title}</p>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// A button that opens a Sheet on click, rendering the sheet's content only
// while open (each wrapped form's own internal state resets naturally
// between opens, since it unmounts on close). `sheetTitle` is separate
// from the trigger button's own label so a compact trigger ("+ Assign")
// can still produce a readable sheet header ("Assign Technicians").
export default function ActionSheetTrigger({
  label,
  sheetTitle,
  variant = "secondary",
  size = "sm",
  className = "",
  children,
}: {
  label: string;
  sheetTitle: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={sheetTitle}>
        {children}
      </Sheet>
    </>
  );
}
