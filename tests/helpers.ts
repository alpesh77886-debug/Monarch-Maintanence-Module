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

export async function signInAs(role: Role) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "maintenance" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword(CREDS[role]);
  if (error || !data.user) {
    throw new Error(`signInAs(${role}) failed: ${error?.message ?? "no user returned"}`);
  }
  return { client, userId: data.user.id };
}

// Every case this suite creates is tagged so it's trivially identifiable
// (and safely ignorable) in the live app — see tests/README.md for why
// automated cleanup isn't attempted (no DELETE policy exists on cases or
// any audit table, deliberately, per §0 rule 6 / §27 append-only history).
export function testSymptom(label: string): string {
  return `[AUTOTEST] ${label} (${new Date().toISOString()})`;
}
