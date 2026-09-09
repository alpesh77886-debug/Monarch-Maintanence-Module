"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

// §22.1: manual handover is preferred, so signing out with cases still owned
// must warn rather than silently drop them. On confirm the server decides
// where they go (next available Executive, else UNASSIGNED) — this component
// only asks, it does not pick the receiver.
export default function SignOutButton() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [openCaseCount, setOpenCaseCount] = useState<number | null>(null);
  const [reason, setReason] = useState("End of shift");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Loop 83: this confirm dialog duplicated Sheet's (Loop 69/51)
  // fixed-overlay markup but none of its accessibility work — no
  // role="dialog", no focus trap, no Escape-to-close, no focus-return.
  // Same trap logic as Sheet's, kept local rather than exported from
  // sheet.tsx to avoid touching that file's single-default-export
  // convention (Loop 16 boundary lesson).
  useEffect(() => {
    if (openCaseCount === null) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenCaseCount(null);
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) {
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
  }, [openCaseCount]);

  async function signOutNow() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function handleSignOutClick() {
    setError(null);
    setChecking(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setChecking(false);
      await signOutNow();
      return;
    }

    const { count, error } = await supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("current_owner_user_id", user.id)
      .not("status", "in", "(CLOSED,REJECTED,DUPLICATE)");

    setChecking(false);

    if (error) {
      // Never trap someone in the app because the check failed — but do say
      // why, so an unhanded-over case isn't silently lost either.
      setError(`Could not check your open cases (${error.message}). Sign out anyway?`);
      setOpenCaseCount(0);
      return;
    }

    if (!count) {
      await signOutNow();
      return;
    }
    setOpenCaseCount(count);
  }

  async function handoverAndSignOut() {
    setError(null);
    if (!reason.trim()) {
      setError("A handover reason is required.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("handover_all_open_cases", { p_reason: reason });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    await signOutNow();
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={handleSignOutClick} disabled={checking}>
        {checking ? "Checking…" : "Sign out"}
      </Button>

      {openCaseCount !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/50 p-4 backdrop-blur-sm"
          onClick={() => setOpenCaseCount(null)}
        >
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-out-dialog-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl outline-none"
          >
            <h2 id="sign-out-dialog-title" className="text-base font-semibold text-fg">
              You still own {openCaseCount} open case{openCaseCount === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Handing over keeps the full history and does not reset case age. If no
              Executive is available, the cases are left unassigned and Managers are
              notified — they are never silently dropped.
            </p>
            <label className="mt-3 block text-sm text-fg">
              Handover reason
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line2 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </label>
            {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={handoverAndSignOut} disabled={submitting}>
                {submitting ? "Handing over…" : "Hand over & sign out"}
              </Button>
              <Button variant="secondary" onClick={() => setOpenCaseCount(null)} disabled={submitting}>
                Stay signed in
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
