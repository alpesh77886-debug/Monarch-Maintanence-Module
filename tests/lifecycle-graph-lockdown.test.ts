import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 43 — RISK-28 (CRITICAL).
//
// maintenance.status_transitions IS the §4 LOCKED lifecycle graph. Every
// transition check in the product validates against it. Migration 0003 created
// it and never enabled RLS, and Supabase grants full DML on a schema's tables
// to anon and authenticated by default — so the rule every case is judged by
// was writable by anyone holding the public anon key.
//
// Proven live before the fix, as the anon role with NO JWT:
//   INSERT ('REPORTED','CLOSED')            -> SUCCEEDED
//   DELETE FROM status_transitions (no WHERE) -> SUCCEEDED, 0 edges left
// Both reverted immediately; the graph was verified back to exactly its
// canonical 26 edges (0 missing, 0 extra, compared set-wise against 0003).
//
// These tests are the standing guard. The first two pin the lockdown. The third
// is a CANARY: if anything ever adds an edge to the graph outside a migration,
// the edge count changes and this fails.

// The canonical §4 graph as written in 0003. Changing this number is a §42
// Change Control action, not a test fix.
const CANONICAL_EDGE_COUNT = 26;

describe("§4 lifecycle graph — not writable by a client", () => {
  it("refuses an INSERT from a signed-in non-staff user", async () => {
    const tech = await signInAs("technician");
    const { error } = await tech.client
      .from("status_transitions")
      .insert({ from_status: "REPORTED", to_status: "CLOSED" });
    expect(error).not.toBeNull();
  });

  it("refuses an INSERT even from Maintenance staff", async () => {
    // Staff authority does not extend to rewriting the lifecycle rules. That is
    // a migration + §42 Change Control action, never a runtime write.
    const exec = await signInAs("executive");
    const { error } = await exec.client
      .from("status_transitions")
      .insert({ from_status: "REPORTED", to_status: "CLOSED" });
    expect(error).not.toBeNull();
  });

  it("refuses a DELETE from Maintenance staff", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client
      .from("status_transitions")
      .delete()
      .eq("from_status", "REPORTED")
      .eq("to_status", "ACKNOWLEDGED");
    expect(error).not.toBeNull();

    // And the edge it tried to remove is still there.
    const { data } = await exec.client
      .from("status_transitions")
      .select("from_status,to_status")
      .eq("from_status", "REPORTED")
      .eq("to_status", "ACKNOWLEDGED");
    expect(data?.length).toBe(1);
  });
});

describe("§4 lifecycle graph — canary", () => {
  it("still holds exactly the canonical edge count", async () => {
    const exec = await signInAs("executive");
    const { data, error } = await exec.client
      .from("status_transitions")
      .select("from_status,to_status");
    expect(error).toBeNull();
    // If this fails, either a migration legitimately changed the graph (update
    // CANONICAL_EDGE_COUNT and file the §42 entry) or someone wrote to it at
    // runtime, which is the defect RISK-28 was about.
    expect(data?.length).toBe(CANONICAL_EDGE_COUNT);
  });

  it("still refuses an edge that is not in the graph", async () => {
    // The end-to-end consequence: with the injected REPORTED -> CLOSED edge, a
    // case could be closed with no diagnosis, no repair and no QC clearance.
    // Without it, transition_case rejects the jump.
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("lifecycle graph canary"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: created!.id,
      p_new_status: "CLOSED",
      p_reason: "canary - must be refused",
      p_evidence_ref: null,
      p_idempotency_key: null,
    });
    expect(error?.message).toMatch(/INVALID_TRANSITION/);
  });
});
