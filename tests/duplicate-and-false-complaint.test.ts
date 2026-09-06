import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 9: §4.6 duplicate case linkage, §4.7 false/wrong complaint closure.

describe("Duplicate case linkage (§4.6)", () => {
  it("blocks DUPLICATE through the generic transition_case path", async () => {
    const exec = await signInAs("executive");
    const { data: created } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("duplicate via generic path"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();

    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: created!.id,
      p_new_status: "DUPLICATE",
      p_reason: "trying the generic path",
    });
    expect(error?.message).toMatch(/USE_MARK_DUPLICATE_CASE/);
  });

  it("requires staff, a reason, and a distinct primary case, and leaves the primary untouched", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: primary } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("duplicate primary"),
        reporter_user_id: exec.userId,
      })
      .select("id, status")
      .single();
    const primaryId = primary!.id as string;

    const { data: dup } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("duplicate of primary"),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    const dupId = dup!.id as string;

    // non-staff cannot mark duplicate
    let { error } = await tech.client.rpc("mark_duplicate_case", {
      p_case_id: dupId,
      p_primary_case_id: primaryId,
      p_reason: "tech tries",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    // cannot be a duplicate of itself
    ({ error } = await exec.client.rpc("mark_duplicate_case", {
      p_case_id: dupId,
      p_primary_case_id: dupId,
      p_reason: "self",
    }));
    expect(error?.message).toMatch(/INVALID_PRIMARY/);

    // reason is mandatory
    ({ error } = await exec.client.rpc("mark_duplicate_case", {
      p_case_id: dupId,
      p_primary_case_id: primaryId,
      p_reason: "",
    }));
    expect(error?.message).toMatch(/REASON_REQUIRED/);

    const { data: result, error: okErr } = await exec.client.rpc("mark_duplicate_case", {
      p_case_id: dupId,
      p_primary_case_id: primaryId,
      p_reason: testSymptom("same breakdown, reported twice"),
    });
    expect(okErr).toBeNull();
    expect((result as { status: string }).status).toBe("DUPLICATE");

    const { data: dupRow } = await exec.client
      .from("cases")
      .select("status, duplicate_of_case_id")
      .eq("id", dupId)
      .single();
    expect(dupRow!.status).toBe("DUPLICATE");
    expect(dupRow!.duplicate_of_case_id).toBe(primaryId);

    // primary case is untouched — still REPORTED, not linked to anything
    const { data: primaryRow } = await exec.client
      .from("cases")
      .select("status, duplicate_of_case_id")
      .eq("id", primaryId)
      .single();
    expect(primaryRow!.status).toBe("REPORTED");
    expect(primaryRow!.duplicate_of_case_id).toBeNull();
  });
});

describe("False/wrong complaint closure (§4.7)", () => {
  it("only the reporting person may close, and OTHER requires an explanation", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await tech.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("false complaint forbidden"),
        reporter_user_id: tech.userId,
      })
      .select("id")
      .single();
    const caseId = created!.id as string;

    let { error } = await exec.client.rpc("close_false_complaint", {
      p_case_id: caseId,
      p_closure_reason: "MISTAKEN_REPORT",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    ({ error } = await tech.client.rpc("close_false_complaint", {
      p_case_id: caseId,
      p_closure_reason: "OTHER",
    }));
    expect(error?.message).toMatch(/EXPLANATION_REQUIRED/);

    ({ error } = await tech.client.rpc("close_false_complaint", {
      p_case_id: caseId,
      p_closure_reason: "",
    }));
    expect(error?.message).toMatch(/REASON_REQUIRED/);

    const { data: result, error: okErr } = await tech.client.rpc("close_false_complaint", {
      p_case_id: caseId,
      p_closure_reason: "MISTAKEN_REPORT",
    });
    expect(okErr).toBeNull();
    expect((result as { status: string }).status).toBe("REJECTED");

    const { data: row } = await tech.client.from("cases").select("status").eq("id", caseId).single();
    expect(row!.status).toBe("REJECTED");
  });

  it("cannot close a complaint that has already moved past REPORTED", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");

    const { data: created } = await tech.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom("false complaint too late"),
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

    const { error } = await tech.client.rpc("close_false_complaint", {
      p_case_id: caseId,
      p_closure_reason: "MISTAKEN_REPORT",
    });
    expect(error?.message).toMatch(/INVALID_TRANSITION/);
  });
});
