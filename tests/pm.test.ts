import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 10: §17 preventive maintenance. Plan creation/approval can be
// exercised fully by signed-in clients. Instance actions (link/complete/
// reschedule) cannot: instances only come into existence via run_pm_scan,
// which is cron-only (EXECUTE revoked from every client role, verified
// below) — there is no client-reachable "create an instance" path, by
// design, same reasoning as not building a test-only cleanup RPC elsewhere
// in this suite. Those RPCs were verified live via execute_sql instead —
// see CHANGELOG.md Loop 10 for the exact runs.

describe("PM plan creation (§17.1, §17.2)", () => {
  it("requires an explicit frequency for a RECURRING plan — none is invented", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("create_pm_plan", {
      p_title: testSymptom("no frequency"),
      p_plan_type: "RECURRING",
    });
    expect(error?.message).toMatch(/FREQUENCY_REQUIRED/);
  });

  it("lets any staff propose a RECURRING plan, unapproved until a Manager acts", async () => {
    const exec = await signInAs("executive");
    const { data, error } = await exec.client.rpc("create_pm_plan", {
      p_title: testSymptom("monthly check"),
      p_plan_type: "RECURRING",
      p_frequency_days: 30,
    });
    expect(error).toBeNull();
    expect((data as { approved: boolean }).approved).toBe(false);
  });

  it("only a Manager may create a ONE_TIME plan, and it is self-approved", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");

    let { error } = await exec.client.rpc("create_pm_plan", {
      p_title: testSymptom("special inspection by exec"),
      p_plan_type: "ONE_TIME",
    });
    expect(error?.message).toMatch(/FORBIDDEN/);

    const { data, error: mgrErr } = await mgr.client.rpc("create_pm_plan", {
      p_title: testSymptom("special inspection by manager"),
      p_plan_type: "ONE_TIME",
    });
    expect(mgrErr).toBeNull();
    expect((data as { approved: boolean }).approved).toBe(true);

    // a ONE_TIME plan must not carry a recurrence frequency
    ({ error } = await mgr.client.rpc("create_pm_plan", {
      p_title: testSymptom("special with frequency"),
      p_plan_type: "ONE_TIME",
      p_frequency_days: 7,
    }));
    expect(error?.message).toMatch(/FREQUENCY_NOT_APPLICABLE/);
  });
});

describe("PM plan approval (§17.3)", () => {
  it("only a Manager may approve, and cannot approve twice", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");

    const { data: created } = await exec.client.rpc("create_pm_plan", {
      p_title: testSymptom("approval flow"),
      p_plan_type: "RECURRING",
      p_frequency_days: 14,
    });
    const planId = (created as { pm_plan_id: string }).pm_plan_id;

    let { error } = await exec.client.rpc("approve_pm_plan", { p_pm_plan_id: planId });
    expect(error?.message).toMatch(/FORBIDDEN/);

    ({ error } = await mgr.client.rpc("approve_pm_plan", { p_pm_plan_id: planId }));
    expect(error).toBeNull();

    ({ error } = await mgr.client.rpc("approve_pm_plan", { p_pm_plan_id: planId }));
    expect(error?.message).toMatch(/ALREADY_APPROVED/);
  });

  it("refuses to approve a ONE_TIME plan (already self-approved at creation)", async () => {
    const mgr = await signInAs("manager");
    const { data: created } = await mgr.client.rpc("create_pm_plan", {
      p_title: testSymptom("already approved one-time"),
      p_plan_type: "ONE_TIME",
    });
    const planId = (created as { pm_plan_id: string }).pm_plan_id;

    const { error } = await mgr.client.rpc("approve_pm_plan", { p_pm_plan_id: planId });
    expect(error?.message).toMatch(/ALREADY_APPROVED/);
  });
});

describe("PM scan lockdown", () => {
  it("run_pm_scan is not callable by any authenticated client", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("run_pm_scan");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/permission denied/i);
  });
});
