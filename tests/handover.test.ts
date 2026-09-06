import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 12: §22 shift handover / availability.
//
// `handover_all_open_cases` (the logout path) is covered here only by its
// guard. It deliberately acts on EVERY open case the caller owns, so calling
// it for real inside this suite would move cases other tests are mid-way
// through using — the suite shares one live project. Its full behaviour
// (auto-handover to the available Executive, and the unassign path when
// nobody is available) was verified live via execute_sql instead; see
// CHANGELOG.md Loop 12.

describe("Manual handover (§22.1, §5.6)", () => {
  it("requires staff, a reason, and a real receiver", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");
    const mgr = await signInAs("manager");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("handover guards"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;
    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });

    // Non-staff cannot hand over at all.
    let { error } = await tech.client.rpc("handover_case", {
      p_case_id: caseId,
      p_to_user_id: mgr.userId,
      p_reason: "tech tries",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    // A reason is mandatory — handover history without a reason is not
    // auditable history.
    ({ error } = await exec.client.rpc("handover_case", {
      p_case_id: caseId,
      p_to_user_id: mgr.userId,
      p_reason: "",
    }));
    expect(error?.message).toMatch(/REASON_REQUIRED/);

    // The receiver must be active Maintenance staff — a technician identity
    // has no maintenance.staff row and cannot hold ownership.
    ({ error } = await exec.client.rpc("handover_case", {
      p_case_id: caseId,
      p_to_user_id: tech.userId,
      p_reason: "handing to a non-staff identity",
    }));
    expect(error?.message).toMatch(/INVALID_RECEIVER/);

    // Handing to the person who already owns it is a no-op, and rejected as
    // one rather than writing a misleading history row.
    ({ error } = await exec.client.rpc("handover_case", {
      p_case_id: caseId,
      p_to_user_id: exec.userId,
      p_reason: "to myself",
    }));
    expect(error?.message).toMatch(/INVALID_RECEIVER/);
  });

  it("preserves ownership history and does not reset case age", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("handover history"),
        reporter_user_id: exec.userId,
      })
      .select("id, created_at")
      .single();
    const caseId = created!.id as string;
    const createdAt = created!.created_at as string;

    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });

    const { error } = await exec.client.rpc("handover_case", {
      p_case_id: caseId,
      p_to_user_id: mgr.userId,
      p_reason: testSymptom("end of shift"),
    });
    expect(error).toBeNull();

    const { data: caseRow } = await exec.client
      .from("cases")
      .select("current_owner_user_id, created_at")
      .eq("id", caseId)
      .single();
    expect(caseRow!.current_owner_user_id).toBe(mgr.userId);
    // §22.1 / §5.6: case age does not reset on handover.
    expect(caseRow!.created_at).toBe(createdAt);

    const { data: history } = await exec.client
      .from("case_ownership")
      .select("owner_user_id, started_at, ended_at, transfer_reason")
      .eq("case_id", caseId)
      .order("started_at", { ascending: true });

    // Prior owner's row is closed, not deleted, and the new one is open —
    // an unbroken chain, which is what "ownership history preserved" means.
    expect(history?.length).toBe(2);
    expect(history![0].owner_user_id).toBe(exec.userId);
    expect(history![0].ended_at).not.toBeNull();
    expect(history![0].transfer_reason).toBeTruthy();
    expect(history![1].owner_user_id).toBe(mgr.userId);
    expect(history![1].ended_at).toBeNull();
    expect(history![1].started_at).toBe(history![0].ended_at);
  });

  it("lets a Manager move someone else's case, but not a non-owner Executive", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");

    // Manager owns this one.
    const { data: created } = await mgr.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("manager override handover"),
        reporter_user_id: mgr.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;
    await mgr.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });

    // A non-owner Executive cannot move it (§3.2: override is the Manager's).
    const { error: execErr } = await exec.client.rpc("handover_case", {
      p_case_id: caseId,
      p_to_user_id: exec.userId,
      p_reason: "grabbing someone else's case",
    });
    expect(execErr?.message).toMatch(/FORBIDDEN/);

    // The Manager can.
    const { error: mgrErr } = await mgr.client.rpc("handover_case", {
      p_case_id: caseId,
      p_to_user_id: exec.userId,
      p_reason: testSymptom("manager reassigns"),
    });
    expect(mgrErr).toBeNull();
  });

  it("notifies the receiver (§23 ownership/handover notifications)", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("handover notification"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;
    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "LOW" });
    await exec.client.rpc("handover_case", {
      p_case_id: caseId,
      p_to_user_id: mgr.userId,
      p_reason: testSymptom("notify me"),
    });

    const { data: received } = await mgr.client
      .from("notifications")
      .select("notification_type, message")
      .eq("case_id", caseId)
      .eq("notification_type", "CASE_HANDOVER_RECEIVED");
    expect(received?.length).toBe(1);

    // And it is the receiver's, not the sender's.
    const { data: senderSees } = await exec.client
      .from("notifications")
      .select("id")
      .eq("case_id", caseId)
      .eq("notification_type", "CASE_HANDOVER_RECEIVED");
    expect(senderSees?.length).toBe(0);
  });
});

describe("Availability (§22)", () => {
  it("is staff-only and self-declared", async () => {
    const tech = await signInAs("technician");
    const exec = await signInAs("executive");

    const { error } = await tech.client.rpc("set_availability", { p_is_available: false });
    expect(error?.message).toMatch(/FORBIDDEN/);

    // Round-trip through both states so the test leaves the account on shift.
    let { error: execErr } = await exec.client.rpc("set_availability", { p_is_available: false });
    expect(execErr).toBeNull();
    let { data: row } = await exec.client
      .from("staff")
      .select("is_available")
      .eq("id", exec.userId)
      .single();
    expect(row!.is_available).toBe(false);

    ({ error: execErr } = await exec.client.rpc("set_availability", { p_is_available: true }));
    expect(execErr).toBeNull();
    ({ data: row } = await exec.client
      .from("staff")
      .select("is_available")
      .eq("id", exec.userId)
      .single());
    expect(row!.is_available).toBe(true);
  });

  it("logout handover requires a reason", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("handover_all_open_cases", { p_reason: "" });
    expect(error?.message).toMatch(/REASON_REQUIRED/);
  });
});
