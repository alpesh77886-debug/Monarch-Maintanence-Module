// Server/edge Sentry init, loaded by Next.js's instrumentation hook.
import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN =
  "https://c5cd3e753aa3e7f3de9a2c9a414b33ae@o4512024225579008.ingest.us.sentry.io/4512038433456128";

export async function register() {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.2,
    debug: false,
  });
}

export const onRequestError = Sentry.captureRequestError;
