import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Safe cleanup of synthetic test data.
//
// `cleanup_synthetic_cases` — the function that actually deletes — has EXECUTE
// revoked from every client role on purpose. The only client-reachable entry
// point is `cleanup_test_cases_since`, which is staff-only, requires an
// explicit window, and delegates every deletion to that guarded function.
//
// Honest limitation stated up front: the "a non-synthetic case is refused"
// guard is NOT tested here. Proving it from a test would mean creating a case
// without the [AUTOTEST prefix, and since no client can delete one, that row
// would then live in the database forever — defeating the very cleanup this
// suite exists to support. That guard was instead proven live, with a
// temporary fixture that was created, refused by the function, and removed
// again in the same transaction. See the CHANGELOG entry for the evidence.

async function makeCase(exec: Awaited<ReturnType<typeof signInAs>>, label: string) {
  const { data } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: exec.userId,
    })
    .select("id")
    .single();
  return data!.id as string;
}

describe("cleanup — window and authority", () => {
  it("refuses a non-staff caller", async () => {
    const tech = await signInAs("technician");
    const { error } = await tech.client.rpc("cleanup_test_cases_since", {
      p_since: new Date().toISOString(),
    });
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("refuses a call with no window — it can never mean 'clean everything'", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("cleanup_test_cases_since", {
      p_since: null,
    });
    expect(error?.message).toMatch(/SINCE_REQUIRED/);
  });

  it("refuses a window wider than 24 hours", async () => {
    const exec = await signInAs("executive");
    const longAgo = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const { error } = await exec.client.rpc("cleanup_test_cases_since", {
      p_since: longAgo,
    });
    expect(error?.message).toMatch(/WINDOW_TOO_WIDE/);
  });
});

describe("cleanup — what it removes and what it leaves", () => {
  it("removes a synthetic case created inside the window, with its events", async () => {
    const exec = await signInAs("executive");
    const since = new Date(Date.now() - 5000).toISOString();
    const caseId = await makeCase(exec, "cleanup A target");
    await exec.client.rpc("acknowledge_case", { p_case_id: caseId, p_priority: "MEDIUM" });

    // it exists, and so does at least one event
    const { data: before } = await exec.client.from("cases").select("id").eq("id", caseId);
    expect(before?.length).toBe(1);
    const { data: evBefore } = await exec.client
      .from("case_events").select("id").eq("case_id", caseId);
    expect((evBefore?.length ?? 0)).toBeGreaterThan(0);

    const { error } = await exec.client.rpc("cleanup_test_cases_since", { p_since: since });
    expect(error).toBeNull();

    const { data: after } = await exec.client.from("cases").select("id").eq("id", caseId);
    expect(after).toEqual([]);
    const { data: evAfter } = await exec.client
      .from("case_events").select("id").eq("case_id", caseId);
    expect(evAfter).toEqual([]);
  });

  it("leaves shared reference data completely untouched", async () => {
    const exec = await signInAs("executive");

    const { data: staffBefore } = await exec.client.from("staff").select("id");
    const { data: plansBefore } = await exec.client.from("pm_plans").select("id");

    const since = new Date(Date.now() - 5000).toISOString();
    await makeCase(exec, "cleanup D shared data");
    await exec.client.rpc("cleanup_test_cases_since", { p_since: since });

    const { data: staffAfter } = await exec.client.from("staff").select("id");
    const { data: plansAfter } = await exec.client.from("pm_plans").select("id");

    expect(staffAfter?.length).toBe(staffBefore?.length);
    expect(plansAfter?.length).toBe(plansBefore?.length);
  });

  it("is idempotent — running it again succeeds and removes nothing", async () => {
    const exec = await signInAs("executive");
    const since = new Date(Date.now() - 5000).toISOString();
    await makeCase(exec, "cleanup H idempotent");

    const first = await exec.client.rpc("cleanup_test_cases_since", { p_since: since });
    expect(first.error).toBeNull();

    const second = await exec.client.rpc("cleanup_test_cases_since", { p_since: since });
    expect(second.error).toBeNull();
    expect((second.data as { deleted_cases: number }).deleted_cases).toBe(0);
  });

  it("does not touch a case created before the window", async () => {
    const exec = await signInAs("executive");
    const older = await makeCase(exec, "cleanup B outside window");

    // window starts AFTER that case was created
    const since = new Date(Date.now() + 1000).toISOString();
    const { error } = await exec.client.rpc("cleanup_test_cases_since", { p_since: since });
    expect(error).toBeNull();

    const { data } = await exec.client.from("cases").select("id").eq("id", older);
    expect(data?.length).toBe(1);
  });
});
