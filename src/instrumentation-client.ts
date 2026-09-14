// Client-side Sentry init, auto-loaded by Next.js (see next.config.ts).
// DSN is a public identifier (submit-only), not a secret — same category as
// the Supabase publishable key, see src/lib/supabase/config.ts.
import * as Sentry from "@sentry/nextjs";

// Loop 94: same CI-vs-production distinction as src/instrumentation.ts —
// see that file's comment. process.env.CI is inlined at build time by
// Next.js, so this resolves correctly in the client bundle too.
Sentry.init({
  dsn: "https://c5cd3e753aa3e7f3de9a2c9a414b33ae@o4512024225579008.ingest.us.sentry.io/4512038433456128",
  environment:
    process.env.VERCEL_ENV ?? (process.env.CI === "true" ? "ci" : process.env.NODE_ENV),
  tracesSampleRate: 0.2,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
