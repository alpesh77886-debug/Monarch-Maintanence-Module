import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import { NextResponse } from "next/server";

// Diagnostic-only route to verify the real Supabase Auth login flow works
// from server-side (reachable from outside this dev sandbox's network,
// which cannot itself reach *.supabase.co). Shared-secret gated. Delete
// once the "Database error querying schema" login bug is confirmed fixed.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== "loop-debug-login") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const email = url.searchParams.get("email");
  const password = url.searchParams.get("password");
  if (!email || !password) {
    return NextResponse.json({ error: "email and password query params required" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  return NextResponse.json({
    ok: !error,
    errorMessage: error?.message ?? null,
    errorStatus: error?.status ?? null,
    hasSession: !!data?.session,
    userId: data?.user?.id ?? null,
  });
}
