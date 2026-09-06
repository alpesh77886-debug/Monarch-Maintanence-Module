"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
      <button
        onClick={handleSignOutClick}
        disabled={checking}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
      >
        {checking ? "Checking…" : "Sign out"}
      </button>

      {openCaseCount !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <h2 className="text-base font-semibold text-slate-900">
              You still own {openCaseCount} open case{openCaseCount === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Handing over keeps the full history and does not reset case age. If no
              Executive is available, the cases are left unassigned and Managers are
              notified — they are never silently dropped.
            </p>
            <label className="mt-3 block text-sm text-slate-700">
              Handover reason
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handoverAndSignOut}
                disabled={submitting}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? "Handing over…" : "Hand over & sign out"}
              </button>
              <button
                onClick={() => setOpenCaseCount(null)}
                disabled={submitting}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                Stay signed in
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
