import { describe, it, expect } from "vitest";
import { signInAs } from "./helpers";

// Loop 38 / RISK-26 — §23: "Notifications are event-driven, not spam-driven"
// and "Notification delivery must be idempotent and auditable."
//
// Three sites sent to the case owner and then looped every active Manager.
// When the owner IS a Manager — normal, a Manager can own a case — that person
// got two byte-identical rows for one event. Found live: the duplicate pairs
// carried timestamps identical to the microsecond, which rules out a race and
// proves it was one scan pass doing it by construction.
//
// The recipient set is the unit under test. Driving a real 24h escalation from
// a test is impractical; the defect lived entirely in who gets collected, and
// that is exactly what these assert.

describe("RISK-26 — case notification recipients are deduplicated", () => {
  it("returns the Manager once when the case owner IS that Manager", async () => {
    const mgr = await signInAs("manager");
    const { data, error } = await mgr.client.rpc("case_notification_recipients", {
      p_extra: mgr.userId,
    });
    expect(error).toBeNull();
    expect(data).toEqual([mgr.userId]);
  });

  it("still includes both when the owner is a different person", async () => {
    const exec = await signInAs("executive");
    const mgr = await signInAs("manager");
    const { data, error } = await exec.client.rpc("case_notification_recipients", {
      p_extra: exec.userId,
    });
    expect(error).toBeNull();

    const recipients = data as string[];
    // The fix must remove the duplicate without dropping anyone.
    expect(recipients).toContain(exec.userId);
    expect(recipients).toContain(mgr.userId);
    expect(new Set(recipients).size).toBe(recipients.length);
  });

  it("returns Managers only when there is no extra recipient", async () => {
    const mgr = await signInAs("manager");
    const { data, error } = await mgr.client.rpc("case_notification_recipients", {
      p_extra: null,
    });
    expect(error).toBeNull();
    expect(data).toEqual([mgr.userId]);
  });

  it("includes a non-staff owner alongside the Managers", async () => {
    const exec = await signInAs("executive");
    const tech = await signInAs("technician");
    const mgr = await signInAs("manager");

    const { data } = await exec.client.rpc("case_notification_recipients", {
      p_extra: tech.userId,
    });
    const recipients = data as string[];
    expect(recipients).toContain(tech.userId);
    expect(recipients).toContain(mgr.userId);
    expect(new Set(recipients).size).toBe(recipients.length);
  });
});

describe("RISK-26 — no duplicate rows remain reachable for once-only events", () => {
  it("produces no duplicate recipient for an escalation-type notification", async () => {
    const exec = await signInAs("executive");

    // Every recipient set the scans can build must be duplicate-free, whoever
    // the owner happens to be.
    for (const owner of [exec.userId, null]) {
      const { data } = await exec.client.rpc("case_notification_recipients", {
        p_extra: owner,
      });
      const recipients = data as string[];
      expect(new Set(recipients).size).toBe(recipients.length);
    }
  });
});
