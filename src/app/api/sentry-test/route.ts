import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

// Diagnostic-only route to verify Sentry observability end-to-end
// (IMPLEMENTATION_PACK.md §19.7 point 8: "verify that a controlled test
// error/event can be captured"). Requires a shared secret query param so it
// can't be triggered by random traffic. Not a business feature — remove once
// Sentry capture has been confirmed a few times across real deploys.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== "loop2-verify") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const eventId = Sentry.captureException(
    new Error("MONARCH Maintenance Sentry verification test (Loop 2)")
  );
  await Sentry.flush(2000);

  return NextResponse.json({ ok: true, eventId });
}
