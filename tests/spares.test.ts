import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 8 (§16 spare request/usage, §3.3 ₹12,000 financial authority split).

describe("Spare requests (§16.3, §3.3)", () => {
  it("computes requires_manager_approval from the ₹12,000 threshold, server-side", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("spare threshold"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { data: cheap, error: cheapErr } = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: testSymptom("bearing"),
      p_quantity_requested: 2,
      p_estimated_amount: 12000,
    });
    expect(cheapErr).toBeNull();
    expect((cheap as { requires_manager_approval: boolean }).requires_manager_approval).toBe(false);

    const { data: expensive, error: expensiveErr } = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: testSymptom("motor assembly"),
      p_quantity_requested: 1,
      p_estimated_amount: 12000.01,
    });
    expect(expensiveErr).toBeNull();
    expect((expensive as { requires_manager_approval: boolean }).requires_manager_approval).toBe(true);
  });

  it("requires a spare name and rejects direct table inserts", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("spare name required"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { error } = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: "",
      p_quantity_requested: 1,
    });
    expect(error?.message).toMatch(/SPARE_NAME_REQUIRED/);

    const { error: insertErr } = await exec.client.from("spare_requests").insert({
      case_id: caseId,
      spare_name: "forged",
      quantity_requested: 1,
      initiated_by: exec.userId,
      initiated_role: "EXECUTIVE",
      requires_manager_approval: false,
    });
    expect(insertErr).not.toBeNull();
  });

  it("gates a >₹12,000 request on Manager approval with mandatory proof — regression test for the is_manager() NULL-propagation bug", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");
    const tech = await signInAs("technician");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("high value spare approval"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { data: request } = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: testSymptom("gearbox"),
      p_quantity_requested: 1,
      p_estimated_amount: 25000,
    });
    const requestId = (request as { spare_request_id: string }).spare_request_id;

    // A non-staff caller (tech1 has no maintenance.staff row, so
    // is_manager() previously returned NULL for them instead of false —
    // this must be a real FORBIDDEN, not a silent pass-through).
    let { error } = await tech.client.rpc("approve_spare_request", {
      p_spare_request_id: requestId,
      p_approval_proof_ref: "forged by non-manager",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    // A staff Executive (not Manager) is also not authorized.
    ({ error } = await exec.client.rpc("approve_spare_request", {
      p_spare_request_id: requestId,
      p_approval_proof_ref: "forged by executive",
    }));
    expect(error?.message).toMatch(/FORBIDDEN/);

    // Manager without proof is rejected.
    ({ error } = await mgr.client.rpc("approve_spare_request", {
      p_spare_request_id: requestId,
      p_approval_proof_ref: "",
    }));
    expect(error?.message).toMatch(/APPROVAL_PROOF_REQUIRED/);

    ({ error } = await mgr.client.rpc("approve_spare_request", {
      p_spare_request_id: requestId,
      p_approval_proof_ref: "PO-autotest-123",
    }));
    expect(error).toBeNull();

    ({ error } = await mgr.client.rpc("approve_spare_request", {
      p_spare_request_id: requestId,
      p_approval_proof_ref: "again",
    }));
    expect(error?.message).toMatch(/ALREADY_APPROVED/);
  });

  it("rejects approval on a request that never crossed the threshold", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("no approval needed"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { data: request } = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: testSymptom("gasket"),
      p_quantity_requested: 1,
      p_estimated_amount: 500,
    });
    const requestId = (request as { spare_request_id: string }).spare_request_id;

    const { error } = await mgr.client.rpc("approve_spare_request", {
      p_spare_request_id: requestId,
      p_approval_proof_ref: "not needed",
    });
    expect(error?.message).toMatch(/NOT_REQUIRED/);
  });
});

describe("Spare usage (§16.1)", () => {
  it("blocks recording usage of an unapproved high-value request, and direct table inserts", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("usage blocked pre-approval"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { data: request } = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: testSymptom("pump"),
      p_quantity_requested: 1,
      p_estimated_amount: 30000,
    });
    const requestId = (request as { spare_request_id: string }).spare_request_id;

    const { error } = await exec.client.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: 1,
      p_spare_request_id: requestId,
    });
    expect(error?.message).toMatch(/APPROVAL_REQUIRED/);

    const { error: insertErr } = await exec.client.from("spare_usage").insert({
      case_id: caseId,
      actor_user_id: exec.userId,
      quantity: 1,
    });
    expect(insertErr).not.toBeNull();
  });

  it("forbids usage recording by a non-staff, non-assigned caller, and allows it for staff and the assigned technician", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("usage actor eligibility"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    // not staff, not assigned -> forbidden
    let { error } = await tech.client.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: 1,
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    // staff -> allowed, no request link needed
    ({ error } = await exec.client.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: 1,
      p_asset_ref: "AUTOTEST-ASSET",
      p_outcome: "installed",
    }));
    expect(error).toBeNull();

    // now assign tech1 and confirm they can record usage on their own case
    await exec.client.rpc("assign_technician", { p_case_id: caseId, p_technician_user_id: tech.userId });
    ({ error } = await tech.client.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: 1,
    }));
    expect(error).toBeNull();

    const { data: usageRows } = await exec.client
      .from("spare_usage")
      .select("*")
      .eq("case_id", caseId);
    expect(usageRows?.length).toBe(2);
  });
});
