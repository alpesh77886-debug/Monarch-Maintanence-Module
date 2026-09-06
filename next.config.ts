import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// Source-map upload needs SENTRY_AUTH_TOKEN, which this environment does not
// have — without it, withSentryConfig just skips the upload step and warns;
// error reporting itself (via the DSN in src/instrumentation*.ts) still works.
export default withSentryConfig(nextConfig, {
  org: "monarch-bo",
  project: "monarch-maintenance-module",
  silent: true,
});
