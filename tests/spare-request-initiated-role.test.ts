import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 46 — triggers/constraints enumerate-first sweep.
//
// raise_spare_request recorded initiated_role as:
//   case when is_staff() then 'EXECUTIVE' else 'TECHNICIAN' end
//
// is_staff() is true for BOTH software roles (§3.1: MAINTENANCE_EXECUTIVE and
// MAINTENANCE_MANAGER), so a Manager-raised request was mislabelled
// 'EXECUTIVE'. initiated_by (the actor uuid) was always correct; only the
// role label was wrong — and it is user-visible: spares-panel.tsx renders
// "Requested by {initiated_role.toLowerCase()}".
//
// Not a security defect (approval routing uses estimated_amount vs the §3.3
// ₹12,000 boundary, independent of this field) — a §16.3/§29 audit-trail
// accuracy defect. maintenance.current_staff_role() already existed and
// already returns the exact role; it was simply never used here.

async function makeCase(actor: Awaited<ReturnType<typeof signInAs>>, label: string) {
  const { data, error } = await actor.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: actor.userId,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

describe("raise_spare_request — initiated_role", () => {
  it("records EXECUTIVE for a MAINTENANCE_EXECUTIVE caller", async () => {
    const exec = await signInAs("executive");
    const caseId = await makeCase(exec, "initiated_role - executive");
    const { data, error } = await exec.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: "test spare",
      p_quantity_requested: 1,
      p_estimated_amount: 500,
      p_intervention_id: null,
    });
    expect(error).toBeNull();
    const { data: row } = await exec.client
      .from("spare_requests")
      .select("initiated_role,initiated_by")
      .eq("id", (data as { spare_request_id: string }).spare_request_id)
      .single();
    expect(row?.initiated_role).toBe("EXECUTIVE");
    expect(row?.initiated_by).toBe(exec.userId);
  });

  it("records MANAGER for a MAINTENANCE_MANAGER caller — the regression this fixes", async () => {
    const mgr = await signInAs("manager");
    const caseId = await makeCase(mgr, "initiated_role - manager");
    const { data, error } = await mgr.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: "test spare",
      p_quantity_requested: 1,
      p_estimated_amount: 500,
      p_intervention_id: null,
    });
    expect(error).toBeNull();
    const { data: row } = await mgr.client
      .from("spare_requests")
      .select("initiated_role,initiated_by")
      .eq("id", (data as { spare_request_id: string }).spare_request_id)
      .single();
    // Before the fix this was 'EXECUTIVE' — is_staff() collapsed both software
    // roles into one label.
    expect(row?.initiated_role).toBe("MANAGER");
    expect(row?.initiated_by).toBe(mgr.userId);
  });

  it("still records TECHNICIAN for a non-staff caller", async () => {
    const tech = await signInAs("technician");
    const exec = await signInAs("executive");
    const caseId = await makeCase(exec, "initiated_role - technician");
    const { data, error } = await tech.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: "test spare",
      p_quantity_requested: 1,
      p_estimated_amount: 500,
      p_intervention_id: null,
    });
    expect(error).toBeNull();
    const { data: row } = await exec.client
      .from("spare_requests")
      .select("initiated_role,initiated_by")
      .eq("id", (data as { spare_request_id: string }).spare_request_id)
      .single();
    expect(row?.initiated_role).toBe("TECHNICIAN");
    expect(row?.initiated_by).toBe(tech.userId);
  });

  it("the ₹12,000 approval boundary is unaffected by who initiates", async () => {
    // Regression guard: this fix must not touch §3.3's approval routing, which
    // is derived from estimated_amount alone.
    const mgr = await signInAs("manager");
    const caseId = await makeCase(mgr, "initiated_role - approval boundary");
    const { data, error } = await mgr.client.rpc("raise_spare_request", {
      p_case_id: caseId,
      p_spare_name: "high value spare",
      p_quantity_requested: 1,
      p_estimated_amount: 15000,
      p_intervention_id: null,
    });
    expect(error).toBeNull();
    expect((data as { requires_manager_approval: boolean }).requires_manager_approval).toBe(true);
  });
});
