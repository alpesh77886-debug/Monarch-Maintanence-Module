import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 7: §6 emergency two-step confirmation, §23 notifications, and the
// client-side guardrails around the §7.2/§7.3 escalation timers. The timers
// themselves (24h/1h) cannot be exercised end-to-end from a test that runs
// in seconds — see tests/README.md — so this suite covers everything that
// *can* run live: the RPC guards, RLS on notifications, and confirming the
// escalation-scan function is not directly callable by a client.

describe("Emergency two-step workflow (§6, §7.3)", () => {
  it("requires a reason to claim", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("emergency reason required"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await exec.client.rpc("claim_emergency", {
      p_case_id: created!.id,
      p_reason: "",
    });
    expect(error?.message).toMatch(/REASON_REQUIRED/);
  });

  it("only the reporter or staff may claim", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("emergency forbidden claim"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await tech.client.rpc("claim_emergency", {
      p_case_id: created!.id,
      p_reason: "not my case, not staff",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("enforces claim-then-confirm ordering and blocks re-claim/re-confirm afterward", async () => {
    const mgr = await signInAs("manager");
    const tech = await signInAs("technician");

    const { data: created } = await tech.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("emergency happy path"),
        reporter_user_id: tech.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    // staff cannot confirm before a claim exists
    let { error } = await mgr.client.rpc("confirm_emergency", { p_case_id: caseId });
    expect(error?.message).toMatch(/NOT_CLAIMED/);

    ({ error } = await tech.client.rpc("claim_emergency", {
      p_case_id: caseId,
      p_reason: "sparking panel, safety hazard",
    }));
    expect(error).toBeNull();

    // reporter (non-staff) cannot confirm their own claim
    ({ error } = await tech.client.rpc("confirm_emergency", { p_case_id: caseId }));
    expect(error?.message).toMatch(/FORBIDDEN/);

    ({ error } = await mgr.client.rpc("confirm_emergency", { p_case_id: caseId }));
    expect(error).toBeNull();

    const { data: confirmedCase } = await mgr.client
      .from("cases")
      .select("emergency_confirmed, emergency_confirmed_at")
      .eq("id", caseId)
      .single();
    expect(confirmedCase!.emergency_confirmed).toBe(true);
    expect(confirmedCase!.emergency_confirmed_at).not.toBeNull();

    ({ error } = await mgr.client.rpc("confirm_emergency", { p_case_id: caseId }));
    expect(error?.message).toMatch(/ALREADY_CONFIRMED/);

    ({ error } = await tech.client.rpc("claim_emergency", {
      p_case_id: caseId,
      p_reason: "trying to re-claim after confirmation",
    }));
    expect(error?.message).toMatch(/ALREADY_CONFIRMED/);
  });

  it("run_escalation_scan is not callable by any authenticated client", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("run_escalation_scan");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/permission denied/i);
  });
});

describe("Notifications (§23)", () => {
  it("acknowledgement notifies the reporter, and only the reporter can read it", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");
    const tech = await signInAs("technician");

    const { data: created } = await tech.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("ack notification"),
        reporter_user_id: tech.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { error: ackErr } = await exec.client.rpc("acknowledge_case", {
      p_case_id: caseId,
      p_priority: "LOW",
    });
    expect(ackErr).toBeNull();

    const { data: reporterNotifs } = await tech.client
      .from("notifications")
      .select("*")
      .eq("case_id", caseId)
      .eq("notification_type", "CASE_ACKNOWLEDGED");
    expect(reporterNotifs?.length).toBe(1);
    expect(reporterNotifs![0].message).toMatch(/acknowledged/);

    // a different staff member (not the recipient) cannot see it — RLS
    const { data: mgrNotifs } = await mgr.client
      .from("notifications")
      .select("*")
      .eq("case_id", caseId)
      .eq("notification_type", "CASE_ACKNOWLEDGED");
    expect(mgrNotifs?.length).toBe(0);
  });

  it("mark_notification_read only lets the recipient mark their own notification read, and direct writes are blocked", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await tech.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("mark read"),
        reporter_user_id: tech.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });

    const { data: notif } = await tech.client
      .from("notifications")
      .select("id")
      .eq("case_id", caseId)
      .single();
    const notificationId = notif!.id as string;

    // not the recipient -> RPC rejects
    const { error: wrongUserErr } = await exec.client.rpc("mark_notification_read", {
      p_notification_id: notificationId,
    });
    expect(wrongUserErr).not.toBeNull();

    // direct insert is blocked (RPC-only, per 0008 migration)
    const { error: insertErr } = await tech.client.from("notifications").insert({
      recipient_user_id: tech.userId,
      case_id: caseId,
      notification_type: "CASE_ACKNOWLEDGED",
      message: "forged",
    });
    expect(insertErr).not.toBeNull();

    // recipient marks it read via the RPC
    const { error: readErr } = await tech.client.rpc("mark_notification_read", {
      p_notification_id: notificationId,
    });
    expect(readErr).toBeNull();

    // direct update is blocked even for the recipient (RLS `using (false)`,
    // so this silently matches zero rows rather than erroring) — the row
    // must remain unchanged.
    await tech.client.from("notifications").update({ message: "tampered" }).eq("id", notificationId);
    const { data: unchanged } = await tech.client
      .from("notifications")
      .select("message")
      .eq("id", notificationId)
      .single();
    expect(unchanged!.message).not.toBe("tampered");
  });

  it("mark_wait_resolved notifies the case owner immediately (§7.2)", async () => {
    const exec = await signInAs("executive");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("resume ready notification"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });

    const { data: wait } = await exec.client.rpc("enter_waiting", {
      p_case_id: caseId,
      p_reason_type: "EXTERNAL",
      p_reason_text: testSymptom("waiting on vendor part"),
    });
    const waitId = (wait as { wait_id: string }).wait_id;

    const { error } = await exec.client.rpc("mark_wait_resolved", { p_wait_id: waitId });
    expect(error).toBeNull();

    const { data: notifs } = await exec.client
      .from("notifications")
      .select("*")
      .eq("case_id", caseId)
      .eq("notification_type", "WAIT_RESUME_READY");
    expect(notifs?.length).toBe(1);
  });
});

// Loop 26 (RISK-18): case_assignments' emergency_direct_start RLS path had
// never been tested since it was introduced (Loop 3, migration 0004) — and
// turned out to allow exactly what its own name promises to guard against.
// The policy checked `emergency_direct_start AND technician_user_id =
// auth.uid()` but never verified the case was an actual confirmed
// emergency, so any non-staff technician could self-insert an active
// case_assignments row (and, via page.tsx's isAssignedTechnician check,
// grant themselves intervention/spare-usage recording rights) on ANY case
// — not just a genuinely confirmed one. Fixed in migration 0025 by adding
// an `emergency_confirmed = true` check on the target case.
describe("case_assignments emergency_direct_start (§5.5, §6, RISK-18)", () => {
  it("refuses a direct self-insert when the case is not a confirmed emergency", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("direct-start not an emergency"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await tech.client.from("case_assignments").insert({
      case_id: created!.id,
      technician_user_id: tech.userId,
      emergency_direct_start: true,
    });
    expect(error).not.toBeNull();
  });

  it("refuses a direct self-insert claiming a different technician_user_id, even on a confirmed emergency", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");
    const tech = await signInAs("technician");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("direct-start impersonation"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("claim_emergency", { p_case_id: caseId, p_reason: "autotest" });
    await mgr.client.rpc("confirm_emergency", { p_case_id: caseId });

    // Genuinely a different real user (exec, not tech) — a placeholder UUID
    // isn't safe here: an arbitrary-looking UUID can collide with a real
    // seeded user's own id, silently turning "impersonation" into a
    // legitimate self-insert (see CHANGELOG Loop 27 CI fix).
    const { error } = await tech.client.from("case_assignments").insert({
      case_id: caseId,
      technician_user_id: exec.userId,
      emergency_direct_start: true,
    });
    expect(error).not.toBeNull();
  });

  it("allows a direct self-insert once the case is a genuinely confirmed emergency", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");
    const tech = await signInAs("technician");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("direct-start legitimate"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    await exec.client.rpc("claim_emergency", { p_case_id: caseId, p_reason: "autotest" });
    await mgr.client.rpc("confirm_emergency", { p_case_id: caseId });

    const { data, error } = await tech.client
      .from("case_assignments")
      .insert({
        case_id: caseId,
        technician_user_id: tech.userId,
        emergency_direct_start: true,
      })
      .select("is_active")
      .single();
    expect(error).toBeNull();
    expect(data!.is_active).toBe(true);
  });
});
