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

    const { data: request } = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: testSymptom("bearing"),
      p_quantity_requested: 2,
    });
    const requestId = (request as { spare_request_id: string }).spare_request_id;

    // not staff, not assigned -> forbidden
    let { error } = await tech.client.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: 1,
      p_spare_request_id: requestId,
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    // staff -> allowed, linked to the request
    ({ error } = await exec.client.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: 1,
      p_spare_request_id: requestId,
      p_asset_ref: "AUTOTEST-ASSET",
      p_outcome: "installed",
    }));
    expect(error).toBeNull();

    // now assign tech1 and confirm they can record usage on their own case
    await exec.client.rpc("assign_technician", { p_case_id: caseId, p_technician_user_id: tech.userId });
    ({ error } = await tech.client.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: 1,
      p_spare_request_id: requestId,
    }));
    expect(error).toBeNull();

    const { data: usageRows } = await exec.client
      .from("spare_usage")
      .select("*")
      .eq("case_id", caseId);
    expect(usageRows?.length).toBe(2);
  });
});

// Loop 29 (RISK-21): record_spare_usage's >₹12,000 approval gate was
// entirely conditional on p_spare_request_id being supplied — but that
// parameter defaults to null and nothing forced a caller to pass it,
// so any staff member or assigned technician could record usage with
// zero request, zero approval, and (since spare_usage has no spare_name
// column of its own) zero identification of which spare was even used —
// violating §16.1's "mandatory" traceability chain as well as §3.3.
// Reachable not just via a direct RPC call but via this app's own
// shipped UI (spares-panel.tsx previously defaulted its usage form to
// "(not linked to a request)"). Fixed by requiring p_spare_request_id.
describe("Spare usage requires a linked request (§16.1, §3.3, RISK-21)", () => {
  it("rejects record_spare_usage with no spare_request_id", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("RISK-21 usage without request"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    const { error } = await exec.client.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: 1,
    });
    expect(error?.message).toMatch(/SPARE_REQUEST_REQUIRED/);
  });
});

// Loop 24: §16.2 explicit Stores reference identifiers. Both
// stores_reference_status columns have existed since Loop 1
// (default 'STORES_REFERENCE_PENDING') but no RPC could ever change them —
// checked here for the first time.
describe("Stores reference updates (§16.2, Loop 24)", () => {
  async function seedRequest(label: string) {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({ case_type: "BREAKDOWN", symptom: testSymptom(label), reporter_user_id: exec.userId })
      .select("id")
      .single();
    const caseId = created!.id as string;
    const { data: req } = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: testSymptom("bearing"),
      p_quantity_requested: 1,
    });
    return { exec, caseId, requestId: (req as { spare_request_id: string }).spare_request_id };
  }

  it("spare_requests default to STORES_REFERENCE_PENDING with no reference id (§16.2)", async () => {
    const { exec, requestId } = await seedRequest("stores default");
    const { data } = await exec.client
      .from("spare_requests")
      .select("stores_reference_status, stores_reference_id")
      .eq("id", requestId)
      .single();
    expect(data!.stores_reference_status).toBe("STORES_REFERENCE_PENDING");
    expect(data!.stores_reference_id).toBeNull();
  });

  it("set_spare_request_stores_reference is staff-only and requires a status", async () => {
    const { requestId } = await seedRequest("stores request guards");
    const tech = await signInAs("technician");
    let { error } = await tech.client.rpc("set_spare_request_stores_reference", {
      p_spare_request_id: requestId,
      p_stores_reference_status: "STORES_ISSUED",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    const exec = await signInAs("executive");
    ({ error } = await exec.client.rpc("set_spare_request_stores_reference", {
      p_spare_request_id: requestId,
      p_stores_reference_status: "   ",
    }));
    expect(error?.message).toMatch(/STATUS_REQUIRED/);
  });

  it("updates the status and reference id on a spare request", async () => {
    const { exec, requestId } = await seedRequest("stores request update");
    const { error } = await exec.client.rpc("set_spare_request_stores_reference", {
      p_spare_request_id: requestId,
      p_stores_reference_status: "STORES_ISSUED",
      p_stores_reference_id: "PO-9001",
      p_reason: "autotest",
    });
    expect(error).toBeNull();

    const { data } = await exec.client
      .from("spare_requests")
      .select("stores_reference_status, stores_reference_id")
      .eq("id", requestId)
      .single();
    expect(data!.stores_reference_status).toBe("STORES_ISSUED");
    expect(data!.stores_reference_id).toBe("PO-9001");
  });

  it("set_spare_usage_stores_reference is staff-only, requires a status, and updates the row", async () => {
    const { exec, caseId, requestId } = await seedRequest("stores usage");
    const { data: usage } = await exec.client.rpc("record_spare_usage", {
      p_case_id: caseId,
      p_quantity: 1,
      p_spare_request_id: requestId,
    });
    const usageId = (usage as { spare_usage_id: string }).spare_usage_id;

    const tech = await signInAs("technician");
    let { error } = await tech.client.rpc("set_spare_usage_stores_reference", {
      p_spare_usage_id: usageId,
      p_stores_reference_status: "STORES_ISSUED",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    ({ error } = await exec.client.rpc("set_spare_usage_stores_reference", {
      p_spare_usage_id: usageId,
      p_stores_reference_status: "",
    }));
    expect(error?.message).toMatch(/STATUS_REQUIRED/);

    ({ error } = await exec.client.rpc("set_spare_usage_stores_reference", {
      p_spare_usage_id: usageId,
      p_stores_reference_status: "STORES_ISSUED",
      p_stores_reference_id: "PO-9002",
    }));
    expect(error).toBeNull();

    const { data } = await exec.client
      .from("spare_usage")
      .select("stores_reference_status, stores_reference_id")
      .eq("id", usageId)
      .single();
    expect(data!.stores_reference_status).toBe("STORES_ISSUED");
    expect(data!.stores_reference_id).toBe("PO-9002");
  });

  it("rejects an unknown spare_request_id / spare_usage_id", async () => {
    const exec = await signInAs("executive");
    const unknown = "00000000-0000-0000-0000-000000000000";

    let { error } = await exec.client.rpc("set_spare_request_stores_reference", {
      p_spare_request_id: unknown,
      p_stores_reference_status: "STORES_ISSUED",
    });
    expect(error?.message).toMatch(/SPARE_REQUEST_NOT_FOUND/);

    ({ error } = await exec.client.rpc("set_spare_usage_stores_reference", {
      p_spare_usage_id: unknown,
      p_stores_reference_status: "STORES_ISSUED",
    }));
    expect(error?.message).toMatch(/SPARE_USAGE_NOT_FOUND/);
  });
});
