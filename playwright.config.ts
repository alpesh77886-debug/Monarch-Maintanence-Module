import { defineConfig, devices } from "@playwright/test";

// Browser E2E (RISK-05, open since Loop 1). These run against a locally
// built-and-started app rather than a Vercel preview URL: it removes the
// deploy-timing race in CI, and the thing under test here is this repo's own
// client-side wiring (forms -> Supabase RPCs), not Vercel's edge.
//
// Supabase itself is reached over the real internet, which works in GitHub
// Actions but NOT in this repo's dev sandbox (egress proxy blocks
// *.supabase.co) — so locally these get as far as rendering /login and then
// fail at sign-in. That is the same known limitation the Vitest suite has;
// see tests/README.md and e2e/README.md.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Each spec drives one signed-in browser session through multi-step
  // lifecycle flows; running them in parallel against one shared Supabase
  // project makes failures harder to read than they're worth.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // CI installs its own matching browser, so this stays unset there.
        // It exists for environments that ship a pre-installed Chromium of a
        // different build than this Playwright version expects (this repo's
        // dev sandbox does: `E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium`).
        launchOptions: process.env.E2E_CHROMIUM_PATH
          ? { executablePath: process.env.E2E_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  // Skipped when E2E_BASE_URL points at an already-running app (e.g. a
  // deployed URL); otherwise Playwright builds+starts the app itself.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start --port ${PORT}`,
        url: `${BASE_URL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
