import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../src/lib/supabase/config";

// Seeded demo accounts (see STATUS.md / RISK_REGISTER.md RISK-10 for how
// they were created and fixed). This suite deliberately runs against the
// same live Supabase project the app itself uses — there is no separate
// test/staging project (see tests/README.md for the tradeoff this implies).
export const CREDS = {
  executive: { email: "exec1@monarch.test", password: "Loop1TestPass!23" },
  manager: { email: "mgr1@monarch.test", password: "Loop1TestPass!23" },
  technician: { email: "tech1@monarch.test", password: "Loop1TestPass!23" },
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
