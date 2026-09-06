"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RecurrenceFlag, CapaLink, StaffMember } from "@/lib/supabase/database.types";

// §18 recurrence + §19 CAPA.
//
// The wording in this panel is load-bearing. §18 lets the system flag
// "Recurring Failure Suspected" but forbids it from declaring root cause, and
// says an Executive/Manager confirms recurrence status. So a system-created
// flag is shown as *suspected*, the root-cause box only appears once a human
// has confirmed it, and nothing here ever fills that box in automatically.
//
// §19 puts both CAPA ownership and effectiveness verification with the
// Maintenance Manager, and allows the system to *suggest* candidates but never
// to certify them. A SYSTEM_SUGGESTED CAPA is therefore labelled as a
// suggestion awaiting review, and the verify controls are Manager-only —
// server-side too, not just hidden here.
export default function RecurrenceCapaPanel({
  caseId,
  flags,
  capas,
  staff,
  isManager,
  nameById,
}: {
  caseId: string;
  flags: RecurrenceFlag[];
  capas: CapaLink[];
  staff: StaffMember[];
  isManager: boolean;
  nameById: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});
  const [rootCause, setRootCause] = useState<Record<string, string>>({});
  const [capaTitle, setCapaTitle] = useState("");
  const [capaAction, setCapaAction] = useState("");
  const [capaOwner, setCapaOwner] = useState("");
  const [verifyNote, setVerifyNote] = useState<Record<string, string>>({});

  const managers = staff.filter((s) => s.role === "MAINTENANCE_MANAGER" && s.is_active);

  async function call(name: string, args: Record<string, unknown>, after?: () => void) {
    setError(null);
    setBusy(true);
    const { error } = await createClient().rpc(name, args);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    after?.();
    router.refresh();
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-3"
      data-testid="recurrence-capa-panel"
    >
      <h2 className="text-sm font-semibold text-slate-900">Recurrence &amp; CAPA</h2>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {/* ---------------- §18 recurrence ---------------- */}
      <div>
        <h3 className="text-xs font-semibold uppercase text-slate-500">
          Recurrence flags
        </h3>
        {flags.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">
            No recurrence flagged for this case.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-2">
            {flags.map((f) => (
              <li key={f.id} className="rounded-md border border-slate-200 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      f.status === "SUSPECTED"
                        ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                        : f.status === "CONFIRMED"
                          ? "rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800"
                          : "rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                    }
                  >
                    {f.status === "SUSPECTED"
                      ? "Recurring Failure Suspected"
                      : f.status === "CONFIRMED"
                        ? "Recurrence confirmed"
                        : "Dismissed"}
                  </span>
                  {f.evidence_tier && (
                    <span className="text-xs text-slate-500">
                      evidence tier: {f.evidence_tier}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {f.related_case_ids.length} related cases
                  {f.match_value ? ` · matched on ${f.match_value}` : ""}
                </p>

                {f.status === "SUSPECTED" && (
                  <div className="mt-2 flex flex-col gap-1">
                    {/* §18: a human confirms recurrence status. */}
                    <p className="text-xs text-slate-500">
                      Flagged by the system as <em>suspected</em>. An Executive or
                      Manager decides — the system does not confirm recurrence and
                      has not proposed a cause.
                    </p>
                    <input
                      value={decisionReason[f.id] ?? ""}
                      onChange={(e) =>
                        setDecisionReason({ ...decisionReason, [f.id]: e.target.value })
                      }
                      placeholder="Reason for confirming or dismissing (required)"
                      className="rounded-md border border-slate-300 p-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          call("decide_recurrence_flag", {
                            p_flag_id: f.id,
                            p_decision: "CONFIRMED",
                            p_reason: decisionReason[f.id] ?? "",
                          })
                        }
                        className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-50"
                      >
                        Confirm recurrence
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          call("decide_recurrence_flag", {
                            p_flag_id: f.id,
                            p_decision: "DISMISSED",
                            p_reason: decisionReason[f.id] ?? "",
                          })
                        }
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {f.decision_reason && (
                  <p className="mt-1 text-xs text-slate-500">
                    {f.status === "CONFIRMED" ? "Confirmed" : "Dismissed"} by{" "}
                    {nameById[f.confirmed_by ?? ""] ?? "unknown"}: {f.decision_reason}
                  </p>
                )}

                {/* §18: root cause is human-entered, and only once confirmed. */}
                {f.status === "CONFIRMED" && (
                  <div className="mt-2">
                    {f.root_cause_note ? (
                      <p className="text-xs text-slate-600">
                        <span className="font-medium">Root cause:</span>{" "}
                        {f.root_cause_note}{" "}
                        <span className="text-slate-400">
                          — {nameById[f.root_cause_note_by ?? ""] ?? "unknown"}
                        </span>
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <input
                          value={rootCause[f.id] ?? ""}
                          onChange={(e) =>
                            setRootCause({ ...rootCause, [f.id]: e.target.value })
                          }
                          placeholder="Root cause, in your own words"
                          className="rounded-md border border-slate-300 p-1.5 text-sm"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            call(
                              "record_recurrence_root_cause",
                              {
                                p_flag_id: f.id,
                                p_root_cause_note: rootCause[f.id] ?? "",
                              },
                              () => setRootCause({ ...rootCause, [f.id]: "" })
                            )
                          }
                          className="self-start rounded-md border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
                        >
                          Record root cause
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------------- §19 CAPA ---------------- */}
      <div>
        <h3 className="text-xs font-semibold uppercase text-slate-500">CAPA</h3>
        {capas.length > 0 && (
          <ul className="mt-1 flex flex-col gap-2">
            {capas.map((c) => (
              <li key={c.id} className="rounded-md border border-slate-200 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{c.title}</span>
                  {c.source === "SYSTEM_SUGGESTED" && (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800">
                      suggested — not certified
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {c.status === "OPEN"
                      ? "open"
                      : c.status === "VERIFIED_EFFECTIVE"
                        ? "verified effective"
                        : "verified NOT effective"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Owner: {nameById[c.owner_user_id] ?? "unknown"} (Manager)
                </p>
                {c.corrective_action && (
                  <p className="mt-0.5 text-xs text-slate-600">{c.corrective_action}</p>
                )}
                {c.verification_note && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Verification: {c.verification_note} —{" "}
                    {nameById[c.effectiveness_verified_by ?? ""] ?? "unknown"}
                  </p>
                )}

                {/* §19: effectiveness verification is the Manager's, and the
                    system never certifies it. Both outcomes are recordable. */}
                {c.status === "OPEN" &&
                  (isManager ? (
                    <div className="mt-2 flex flex-col gap-1">
                      <input
                        value={verifyNote[c.id] ?? ""}
                        onChange={(e) =>
                          setVerifyNote({ ...verifyNote, [c.id]: e.target.value })
                        }
                        placeholder="Evidence for this verification (required)"
                        className="rounded-md border border-slate-300 p-1.5 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            call("verify_capa_effectiveness", {
                              p_capa_id: c.id,
                              p_effective: true,
                              p_verification_note: verifyNote[c.id] ?? "",
                            })
                          }
                          className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Verify effective
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            call("verify_capa_effectiveness", {
                              p_capa_id: c.id,
                              p_effective: false,
                              p_verification_note: verifyNote[c.id] ?? "",
                            })
                          }
                          className="rounded-md border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
                        >
                          Verify NOT effective
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      Effectiveness verification is the Maintenance Manager&rsquo;s.
                    </p>
                  ))}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex flex-col gap-1">
          <input
            value={capaTitle}
            onChange={(e) => setCapaTitle(e.target.value)}
            placeholder="Raise a CAPA — title"
            className="rounded-md border border-slate-300 p-1.5 text-sm"
          />
          <input
            value={capaAction}
            onChange={(e) => setCapaAction(e.target.value)}
            placeholder="Corrective action (optional)"
            className="rounded-md border border-slate-300 p-1.5 text-sm"
          />
          <select
            value={capaOwner}
            onChange={(e) => setCapaOwner(e.target.value)}
            className="rounded-md border border-slate-300 p-1.5 text-sm"
          >
            <option value="">Owner — Maintenance Manager…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
          {/* Only Managers are listed because §19 fixes CAPA ownership there;
              raise_capa re-checks it server-side regardless. */}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              call(
                "raise_capa",
                {
                  p_case_id: caseId,
                  p_title: capaTitle,
                  p_owner_user_id: capaOwner || null,
                  p_corrective_action: capaAction || null,
                },
                () => {
                  setCapaTitle("");
                  setCapaAction("");
                  setCapaOwner("");
                }
              )
            }
            className="self-start rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Raise CAPA
          </button>
        </div>
      </div>
    </section>
  );
}
