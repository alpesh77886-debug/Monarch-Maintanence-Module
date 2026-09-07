import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../src/lib/supabase/config";

// ---------------------------------------------------------------------------
// F-05 — test writes must never happen silently against an unacknowledged
// environment.
//
// Forensic finding: this suite and the deployed production application point
// at the SAME Supabase project (maavrlqkdrisjwzhjdgg). Today that is harmless
// — a live audit found 7,592 cases of which 7,592 are test-tagged and ZERO are
// real business records, so nothing operational has ever been mixed. The risk
// is entirely forward-looking: the day real cases exist, the next CI run
// writes test rows beside them and every KPI becomes a blend of the two.
//
// A dedicated test project is the proper fix (brief F-05 preference 1) but
// that is a spend decision for the Boss, not something to do unilaterally.
// What IS available now is preference 5, explicit environment tagging: this
// suite refuses to run unless the operator has consciously said that writing
// test data to the configured project is acceptable. CI sets it; a developer
// who later points this at a real production project gets a hard failure
// instead of silent contamination.
// ---------------------------------------------------------------------------
if (process.env.MAINTENANCE_TEST_WRITES_OK !== "1") {
  throw new Error(
    [
      "Refusing to run: this suite writes real rows to the Supabase project at",
      `  ${SUPABASE_URL}`,
      "and no acknowledgement was given.",
      "",
      "Set MAINTENANCE_TEST_WRITES_OK=1 to confirm that project is safe to write",
      "test data into. See F-05 in FORENSIC_REMEDIATION_RECON.md.",
    ].join("\n")
  );
}


// Seeded demo accounts (see STATUS.md / RISK_REGISTER.md RISK-10 for how
// they were created and fixed). This suite deliberately runs against the
// same live Supabase project the app itself uses — there is no separate
// test/staging project (see tests/README.md for the tradeoff this implies).
export const CREDS = {
  executive: { email: "exec1@monarch.test", password: "Loop1TestPass!23" },
  manager: { email: "mgr1@monarch.test", password: "Loop1TestPass!23" },
  technician: { email: "tech1@monarch.test", password: "Loop1TestPass!23" },
  // F-01: a QC decision identity. Deliberately NOT a maintenance.staff row and
  // deliberately not the technician identity — the whole point of the fix is
  // that QC authority is held by someone who is not Maintenance. It is granted
  // through maintenance.qc_authority, never by any role.
  qc: { email: "qc1@monarch.test", password: "Loop1TestPass!23" },
} as const;

export type Role = keyof typeof CREDS;

// Derived, not hand-written: the client is schema-typed to `maintenance`,
// so a bare `SupabaseClient` annotation would not match it.
function createTestClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "maintenance" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type SignedIn = { client: ReturnType<typeof createTestClient>; userId: string };

// One signed-in client per role, reused for the whole run.
//
// This used to sign in fresh on every call. With 78 call sites the suite was
// firing ~78 requests at GoTrue's /token endpoint inside ~80 seconds, from a
// single CI IP — which is over Supabase's auth rate limit. CI failed with
// "Request rate limit reached" (8 tests, all at signInWithPassword; see
// CHANGELOG Loop 14). That was a real defect in this suite, not a flake: it
// got worse with every test added, and re-running would only have moved the
// failure to a different file.
//
// Nothing here needs a fresh session — a role is one user, and the same
// client issues identical requests. So sign in once per role and hand the
// same client out. The promise (not the result) is cached so that concurrent
// first calls can't race into two sign-ins.
const sessions = new Map<Role, Promise<SignedIn>>();

async function openSession(role: Role): Promise<SignedIn> {
  const client = createTestClient();
  const { data, error } = await client.auth.signInWithPassword(CREDS[role]);
  if (error || !data.user) {
    throw new Error(`signInAs(${role}) failed: ${error?.message ?? "no user returned"}`);
  }
  return { client, userId: data.user.id };
}

export function signInAs(role: Role): Promise<SignedIn> {
  let session = sessions.get(role);
  if (!session) {
    // A failed sign-in must not be cached, or one transient network error
    // would fail every remaining test with a stale rejected promise.
    session = openSession(role).catch((err) => {
      sessions.delete(role);
      throw err;
    });
    sessions.set(role, session);
  }
  return session;
}

// Every case this suite creates is tagged so it's trivially identifiable
// (and safely ignorable) in the live app — see tests/README.md for why
// automated cleanup isn't attempted (no DELETE policy exists on cases or
// any audit table, deliberately, per §0 rule 6 / §27 append-only history).
export function testSymptom(label: string): string {
  return `[AUTOTEST] ${label} (${new Date().toISOString()})`;
}
