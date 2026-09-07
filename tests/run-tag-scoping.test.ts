import { describe, it, expect } from "vitest";
import { signInAs } from "./helpers";
import { runTag, runMarker } from "./run-tag";

// Loop 41 — F-41-2: cross-run deletion.
//
// `cleanup_test_cases_since` used to select on nothing but a time window plus
// the '[AUTOTEST' prefix. CI keys `concurrency` on github.ref, so a PR run and
// a main-branch run sit in different groups and can overlap — and when they
// did, whichever finished first deleted the other run's in-flight cases,
// failing a suite that had done nothing wrong.
//
// These tests pin the fix from the client side. The isolation property itself
// (run A's cleanup leaves run B's rows alone) was also proven live against the
// database; the evidence is in LOOP_41_REPORT.md. It is not reproduced here as
// a delete-and-assert, because a test that deliberately leaves a second run's
// rows behind to prove they survived would leak exactly the rows this whole
// feature exists to stop leaking.

const OTHER_RUN_TAG = "loop41-other-run-fixture";

describe("run tag — client helper", () => {
  it("produces a marker only when a run id is configured", () => {
    const tag = runTag();
    if (tag === null) {
      expect(runMarker()).toBe("");
    } else {
      expect(runMarker()).toBe(`[run=${tag}]`);
    }
  });

  it("never emits a character the server's charset rejects", () => {
    const tag = runTag();
    if (tag === null) return;
    // The server validates ^[A-Za-z0-9.-]{4,64}$. '_' is deliberately absent:
    // it is a single-character wildcard in SQL LIKE, and an earlier version of
    // this feature matched the tag with LIKE, so a tag of 'RUN___' matched
    // 'RUNBBB' and deleted another run's case. The server now matches with
    // strpos(), but the helper must not produce a tag the server would refuse.
    expect(tag).toMatch(/^[A-Za-z0-9.-]{4,64}$/);
  });
});

describe("run tag — server validation", () => {
  it("refuses a tag containing a LIKE wildcard", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("cleanup_test_cases_since", {
      p_since: new Date().toISOString(),
      p_run_tag: "%",
    });
    expect(error?.message).toMatch(/INVALID_RUN_TAG/);
  });

  it("refuses a tag containing an underscore wildcard", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("cleanup_test_cases_since", {
      p_since: new Date().toISOString(),
      p_run_tag: "loop41-RUN___",
    });
    expect(error?.message).toMatch(/INVALID_RUN_TAG/);
  });

  it("refuses a tag that is too short to be a real run id", async () => {
    const exec = await signInAs("executive");
    const { error } = await exec.client.rpc("cleanup_test_cases_since", {
      p_since: new Date().toISOString(),
      p_run_tag: "ab",
    });
    expect(error?.message).toMatch(/INVALID_RUN_TAG/);
  });

  it("still refuses a non-staff caller when a valid tag is supplied", async () => {
    const tech = await signInAs("technician");
    const { error } = await tech.client.rpc("cleanup_test_cases_since", {
      p_since: new Date().toISOString(),
      p_run_tag: OTHER_RUN_TAG,
    });
    // Authority is checked before the tag, so this is FORBIDDEN, not
    // INVALID_RUN_TAG — the tag parameter must not become a way around the
    // staff gate.
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("still enforces the 24h window when a valid tag is supplied", async () => {
    const exec = await signInAs("executive");
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { error } = await exec.client.rpc("cleanup_test_cases_since", {
      p_since: twoDaysAgo,
      p_run_tag: OTHER_RUN_TAG,
    });
    expect(error?.message).toMatch(/WINDOW_TOO_WIDE/);
  });

  it("deletes nothing when scoped to a tag no case carries", async () => {
    const exec = await signInAs("executive");
    const { data, error } = await exec.client.rpc("cleanup_test_cases_since", {
      p_since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      p_run_tag: OTHER_RUN_TAG,
    });
    expect(error).toBeNull();
    // This is the isolation property in its safe direction: a cleanup scoped to
    // a foreign tag touches nothing at all, even though plenty of synthetic
    // cases exist inside the window it was given.
    expect((data as { deleted_cases: number }).deleted_cases).toBe(0);
    expect((data as { run_tag: string }).run_tag).toBe(OTHER_RUN_TAG);
  });
});
