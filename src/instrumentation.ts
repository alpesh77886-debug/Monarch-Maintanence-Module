// Server/edge Sentry init, loaded by Next.js's instrumentation hook.
import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN =
  "https://c5cd3e753aa3e7f3de9a2c9a414b33ae@o4512024225579008.ingest.us.sentry.io/4512038433456128";

// Loop 94: CI's own e2e job builds and runs the app with `next start`
// (NODE_ENV=production) on a GitHub Actions runner, not a real Vercel
// deployment. With no CI-aware branch, that traffic was indistinguishable
// from a real user's — every "destination stream closed early" thrown when
// Playwright navigates away mid-stream (MONARCH-MAINTENANCE-MODULE-4, 145
// occurrences, still escalating) showed up tagged `environment: production`.
// GitHub Actions sets CI=true on every runner, so branch on that first.
const SENTRY_ENVIRONMENT =
  process.env.VERCEL_ENV ?? (process.env.CI === "true" ? "ci" : process.env.NODE_ENV);

export async function register() {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: 0.2,
    debug: false,
  });
}

export const onRequestError = Sentry.captureRequestError;
