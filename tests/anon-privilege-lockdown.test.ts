import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../src/lib/supabase/config";
import { signInAs, testSymptom } from "./helpers";

// Loop 44 — RISK-29.
//
// Loop 43 fixed ONE table whose RLS was never enabled. This pins the reason a
// mistake like that was fatal: pg_default_acl for this schema granted every new
// object to `anon` automatically — tables got arwdDxtm (full DML, including
// INSERT/UPDATE/DELETE/TRUNCATE), functions got EXECUTE, sequences got rwU. So
// RLS was the ONLY thing standing between an unauthenticated caller and the
// data, on every table, forever.
//
// Three leaks were proven live as the anon role with no JWT before the fix:
//   case_notification_recipients(null) -> every active Manager's user id
//   case_is_confirmed_emergency(<id>)  -> TRUE for a real emergency case
//   next_case_number()                 -> advanced the sequence, burning MC numbers
//
// These tests use a genuinely SIGNED-OUT client — the anon key with no session —
// which is exactly what an attacker holds, since the anon key ships in the
// browser bundle.

function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "maintenance" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe("anon has no reach into the maintenance schema", () => {
  it("cannot list the manager roster through case_notification_recipients", async () => {
    const { error } = await anonClient().rpc("case_notification_recipients", { p_extra: null });
    expect(error).not.toBeNull();
  });

  it("cannot use case_is_confirmed_emergency as an oracle", async () => {
    const { error } = await anonClient().rpc("case_is_confirmed_emergency", {
      p_case_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(error).not.toBeNull();
  });

  it("cannot burn case numbers through next_case_number", async () => {
    // Every successful call permanently advances the sequence and leaves a gap
    // in an audit-visible identifier series.
    const { error } = await anonClient().rpc("next_case_number", {});
    expect(error).not.toBeNull();
  });

  it("cannot read cases", async () => {
    const { data, error } = await anonClient().from("cases").select("id").limit(1);
    // Either a hard permission error or zero rows is acceptable; leaking a row
    // is not.
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });

  it("cannot write to the locked lifecycle graph", async () => {
    const { error } = await anonClient()
      .from("status_transitions")
      .insert({ from_status: "REPORTED", to_status: "CLOSED" });
    expect(error).not.toBeNull();
  });
});

describe("the lockdown did not break the authenticated path", () => {
  // These three helpers are evaluated as the CALLING user, so revoking them from
  // `authenticated` would have broken authorization rather than tightened it:
  //   can_read_case               -> evidence/safety_stops/production_boundary SELECT policies
  //   case_is_confirmed_emergency -> case_assignments_insert WITH CHECK
  //   next_case_number            -> DEFAULT on cases.case_number
  // This is the regression guard for exactly that.

  it("staff can still create a case, which exercises the case_number default", async () => {
    const exec = await signInAs("executive");
    const { data, error } = await exec.client
      .from("cases")
      .insert({
        case_type: "BREAKDOWN",
        // testSymptom(), not a hand-built string: it carries the [run=<tag>]
        // marker the teardown scopes on. A hand-built "[AUTOTEST] ..." symptom
        // would be left behind forever — the exact leak Loop 41 closed.
        symptom: testSymptom("anon lockdown regression"),
        reporter_user_id: exec.userId,
      })
      .select("id,case_number")
      .single();
    expect(error).toBeNull();
    expect(data?.case_number).toMatch(/^MC-\d+$/);
  });

  it("staff can still read the lifecycle graph", async () => {
    const exec = await signInAs("executive");
    const { data, error } = await exec.client
      .from("status_transitions")
      .select("from_status,to_status");
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThan(0);
  });
});
