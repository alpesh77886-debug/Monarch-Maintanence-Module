import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Loop 94 fix, Codex review: Next.js only inlines NEXT_PUBLIC_* (or vars
  // listed here) into the client bundle — a bare `process.env.CI` reference
  // in client code resolves against an empty shim in the browser. Mapping it
  // through `env` makes GitHub Actions' own CI=true reliably reach
  // src/instrumentation-client.ts too, not just the server-side instrumentation.
  env: {
    NEXT_PUBLIC_CI: process.env.CI ?? "",
  },
};

// Source-map upload needs SENTRY_AUTH_TOKEN, which this environment does not
// have — without it, withSentryConfig just skips the upload step and warns;
// error reporting itself (via the DSN in src/instrumentation*.ts) still works.
export default withSentryConfig(nextConfig, {
  org: "monarch-bo",
  project: "monarch-maintenance-module",
  silent: true,
});
