import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 15: §18 recurrence detection + §19 CAPA.
//
// The rules this file exists to protect:
//
//   §18 "Do not hard-code an unapproved recurrence threshold." PENDING-04 is
//   still open, so `recurrence_rules` ships EMPTY and the scan flags nothing
//   until a Manager configures a tier. The first test asserts that nothing is
//   configured — if a future change seeds a default threshold, this fails.
//
//   §18 the system "must NOT automatically declare root cause" — so root
//   cause cannot even be recorded until a human has confirmed the recurrence.
//
//   §19 CAPA owner and effectiveness verifier are both the Maintenance
//   Manager, and the system "must not autonomously certify effectiveness".
//
// Not covered here: the scan itself creating a flag. `run_recurrence_scan` is
// cron-only and `permission denied` for any client (asserted below), so a
// signed-in test user cannot reach it without a test-only backdoor — the same
// reasoning that kept the PM instance-lifecycle RPCs out of pm.test.ts. The
// full scan → flag → confirm → root cause → CAPA → verify chain was exercised
// live instead; see CHANGELOG.md Loop 15 for the run and its results.

describe("§18 — no recurrence threshold is hard-coded (PENDING-04)", () => {
  it("ships with no ACTIVE recurrence rule configured", async () => {
    const exec = await signInAs("executive");
    const { data, error } = await exec.client
      .from("recurrence_rules")
      .select("id, tier_name, is_active")
      .eq("is_active", true);

    expect(error).toBeNull();
    // An active rule here means somebody committed a threshold the approved
    // design has not supplied. PENDING-04 must be closed by the Boss first.
    expect(data ?? []).toHaveLength(0);
  });

  it("run_recurrence_scan is not callable by any authenticated client", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("run_recurrence_scan");
    // A permission error, not a business-logic one — the scan is cron-only.
    expect(error?.message).toMatch(/permission denied/i);
  });
});

describe("create_recurrence_rule (§18 configuration)", () => {
  it("is Manager-only", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("create_recurrence_rule", {
      p_tier_name: testSymptom("exec tier"),
      p_match_on: "LINE",
      p_threshold_count: 3,
      p_window_days: 30,
      p_approval_note: "should not be allowed",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("refuses a threshold with no written basis, and refuses nonsense values", async () => {
    const mgr = await signInAs("manager");

    // §18: historical examples may inform configuration but do not become the
    // rule by themselves — so the basis has to be written down.
    let { error } = await mgr.client.rpc("create_recurrence_rule", {
      p_tier_name: testSymptom("tier"),
      p_match_on: "LINE",
      p_threshold_count: 3,
      p_window_days: 30,
      p_approval_note: "   ",
    });
    expect(error?.message).toMatch(/APPROVAL_NOTE_REQUIRED/);

    ({ error } = await mgr.client.rpc("create_recurrence_rule", {
      p_tier_name: testSymptom("tier"),
      p_match_on: "LINE",
      p_threshold_count: 1,
      p_window_days: 30,
      p_approval_note: "basis",
    }));
    expect(error?.message).toMatch(/INVALID_THRESHOLD/);

    ({ error } = await mgr.client.rpc("create_recurrence_rule", {
      p_tier_name: testSymptom("tier"),
      p_match_on: "LINE",
      p_threshold_count: 3,
      p_window_days: 0,
      p_approval_note: "basis",
    }));
    expect(error?.message).toMatch(/INVALID_WINDOW/);
  });
});

// Loop 23: set_recurrence_rule_active had zero automated coverage before
// this — only ad-hoc live verification in Loops 15/20/21's own runs, never
// written as a regression test. A rule created here is deactivated again in
// the same test (never left active), matching the standing PENDING-04
// discipline that the "0 active rules" test above must never be broken by
// a leftover from another test.
describe("set_recurrence_rule_active (§18 configuration)", () => {
  async function createTestRule(mgr: Awaited<ReturnType<typeof signInAs>>) {
    const { data } = await mgr.client.rpc("create_recurrence_rule", {
      p_tier_name: testSymptom("toggle test tier"),
      p_match_on: "LINE",
      p_threshold_count: 5,
      p_window_days: 7,
      p_approval_note: "[AUTOTEST] Loop 23 toggle coverage — not an approved plant threshold",
    });
    return (data as { recurrence_rule_id: string }).recurrence_rule_id;
  }

  it("is Manager-only", async () => {
    const mgr = await signInAs("manager");
    const ruleId = await createTestRule(mgr);

    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("set_recurrence_rule_active", {
      p_rule_id: ruleId,
      p_is_active: false,
      p_reason: "exec should not be able to do this",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    // Clean up via the Manager regardless of the guard result above.
    await mgr.client.rpc("set_recurrence_rule_active", {
      p_rule_id: ruleId,
      p_is_active: false,
      p_reason: "[AUTOTEST] cleanup",
    });
  });

  it("requires a reason and rejects an unknown rule id", async () => {
    const mgr = await signInAs("manager");
    const ruleId = await createTestRule(mgr);

    let { error } = await mgr.client.rpc("set_recurrence_rule_active", {
      p_rule_id: ruleId,
      p_is_active: false,
      p_reason: "   ",
    });
    expect(error?.message).toMatch(/REASON_REQUIRED/);

    ({ error } = await mgr.client.rpc("set_recurrence_rule_active", {
      p_rule_id: "00000000-0000-0000-0000-000000000000",
      p_is_active: false,
      p_reason: "[AUTOTEST]",
    }));
    expect(error?.message).toMatch(/RULE_NOT_FOUND/);

    await mgr.client.rpc("set_recurrence_rule_active", {
      p_rule_id: ruleId,
      p_is_active: false,
      p_reason: "[AUTOTEST] cleanup",
    });
  });

  it("toggles is_active and the change is visible immediately", async () => {
    const mgr = await signInAs("manager");
    const ruleId = await createTestRule(mgr);

    const { data: before } = await mgr.client
      .from("recurrence_rules")
      .select("is_active")
      .eq("id", ruleId)
      .single();
    expect(before!.is_active).toBe(true);

    const { error } = await mgr.client.rpc("set_recurrence_rule_active", {
      p_rule_id: ruleId,
      p_is_active: false,
      p_reason: "[AUTOTEST] Loop 23 toggle coverage — deactivating immediately",
    });
    expect(error).toBeNull();

    const { data: after } = await mgr.client
      .from("recurrence_rules")
      .select("is_active")
      .eq("id", ruleId)
      .single();
    expect(after!.is_active).toBe(false);
  });
});

describe("§19 — CAPA ownership and effectiveness verification", () => {
  async function seedCase(label: string) {
    const exec = await signInAs("executive");
    const { data } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        symptom: testSymptom(label),
        reporter_user_id: exec.userId,
      })
      .select("id")
      .single();
    return { exec, caseId: data!.id as string };
  }

  it("refuses a CAPA owner who is not a Manager", async () => {
    const { exec, caseId } = await seedCase("capa owner");
    const tech = await signInAs("technician");

    // An Executive is staff, but §19 puts CAPA ownership with the Manager.
    let { error } = await exec.client.rpc("raise_capa", {
      p_case_id: caseId,
      p_title: testSymptom("exec owned"),
      p_owner_user_id: exec.userId,
    });
    expect(error?.message).toMatch(/OWNER_MUST_BE_MANAGER/);

    ({ error } = await exec.client.rpc("raise_capa", {
      p_case_id: caseId,
      p_title: testSymptom("tech owned"),
      p_owner_user_id: tech.userId,
    }));
    expect(error?.message).toMatch(/OWNER_NOT_STAFF/);
  });

  it("is staff-only to raise and needs a title", async () => {
    const { caseId } = await seedCase("capa guards");
    const tech = await signInAs("technician");
    const mgr = await signInAs("manager");

    let { error } = await tech.client.rpc("raise_capa", {
      p_case_id: caseId,
      p_title: "non-staff",
      p_owner_user_id: mgr.userId,
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    ({ error } = await mgr.client.rpc("raise_capa", {
      p_case_id: caseId,
      p_title: "   ",
      p_owner_user_id: mgr.userId,
    }));
    expect(error?.message).toMatch(/TITLE_REQUIRED/);
  });

  it("records BOTH verification outcomes, Manager-only, once", async () => {
    const { exec, caseId } = await seedCase("capa verify");
    const mgr = await signInAs("manager");

    // An Executive may raise it; the owner is still the Manager.
    const { data: created, error: raiseErr } = await exec.client.rpc("raise_capa", {
      p_case_id: caseId,
      p_title: testSymptom("capa"),
      p_owner_user_id: mgr.userId,
      p_corrective_action: "replace bearing",
    });
    expect(raiseErr).toBeNull();
    const capaId = (created as { capa_id: string }).capa_id;

    // §19: verification is the Manager's, not any staff member's.
    let { error } = await exec.client.rpc("verify_capa_effectiveness", {
      p_capa_id: capaId,
      p_effective: true,
      p_verification_note: "exec tries",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    ({ error } = await mgr.client.rpc("verify_capa_effectiveness", {
      p_capa_id: capaId,
      p_effective: true,
      p_verification_note: "",
    }));
    expect(error?.message).toMatch(/VERIFICATION_NOTE_REQUIRED/);

    // "Verified and NOT effective" is a real result, not a missing answer —
    // a boolean `effectiveness_verified` could not have expressed it.
    ({ error } = await mgr.client.rpc("verify_capa_effectiveness", {
      p_capa_id: capaId,
      p_effective: false,
      p_verification_note: testSymptom("failure recurred"),
    }));
    expect(error).toBeNull();

    const { data: row } = await mgr.client
      .from("capa_links")
      .select("status, source, effectiveness_verified_by")
      .eq("id", capaId)
      .single();
    expect(row!.status).toBe("VERIFIED_NOT_EFFECTIVE");
    // Not system-suggested: a human raised this one.
    expect(row!.source).toBe("HUMAN");
    expect(row!.effectiveness_verified_by).toBe(mgr.userId);

    ({ error } = await mgr.client.rpc("verify_capa_effectiveness", {
      p_capa_id: capaId,
      p_effective: true,
      p_verification_note: "changed my mind",
    }));
    expect(error?.message).toMatch(/ALREADY_VERIFIED/);
  });
});

describe("Recurrence and CAPA rows are RPC-only and staff-only", () => {
  it("denies direct inserts into recurrence_rules, recurrence_flags and capa_links", async () => {
    const exec = await signInAs("executive");

    const { error: ruleErr } = await exec.client.from("recurrence_rules").insert({
      tier_name: "forged",
      match_on: "LINE",
      threshold_count: 2,
      window_days: 1,
      created_by: exec.userId,
      approval_note: "forged",
    });
    expect(ruleErr).not.toBeNull();

    const { error: flagErr } = await exec.client.from("recurrence_flags").insert({
      case_id: exec.userId, // shape is irrelevant; RLS rejects before this matters
      related_case_ids: [],
    });
    expect(flagErr).not.toBeNull();

    const { error: capaErr } = await exec.client.from("capa_links").insert({
      case_id: exec.userId,
      title: "forged",
      owner_user_id: exec.userId,
    });
    expect(capaErr).not.toBeNull();
  });

  it("hides recurrence and CAPA data from a non-staff user", async () => {
    const tech = await signInAs("technician");

    for (const table of ["recurrence_rules", "recurrence_flags", "capa_links"]) {
      const { data } = await tech.client.from(table).select("id");
      expect(data ?? []).toHaveLength(0);
    }
  });
});
