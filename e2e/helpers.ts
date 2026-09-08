import { expect, type Page } from "@playwright/test";
import { runMarker } from "../tests/run-tag";

// ---------------------------------------------------------------------------
// F-05 — test writes must never happen silently against an unacknowledged
// environment.
//
// Forensic finding: this suite and the deployed production application point
// at the SAME Supabase project (maavrlqkdrisjwzhjdgg). Today that is harmless
// — a live audit found 7,592 cases of which 7,592 are test-tagged and ZERO are
// real business records, so nothing operational has ever been mixed. The risk
// is entirely forward-looking: the day real cases exist, the next CI run
// writes test rows beside them and every KPI becomes a blend of the two.
//
// A dedicated test project is the proper fix (brief F-05 preference 1) but
// that is a spend decision for the Boss, not something to do unilaterally.
// What IS available now is preference 5, explicit environment tagging: this
// suite refuses to run unless the operator has consciously said that writing
// test data to the configured project is acceptable. CI sets it; a developer
// who later points this at a real production project gets a hard failure
// instead of silent contamination.
// ---------------------------------------------------------------------------
if (process.env.MAINTENANCE_TEST_WRITES_OK !== "1") {
  throw new Error(
    [
      "Refusing to run: this suite writes real rows to the Supabase project at",
      "  (see src/lib/supabase/config.ts)",
      "and no acknowledgement was given.",
      "",
      "Set MAINTENANCE_TEST_WRITES_OK=1 to confirm that project is safe to write",
      "test data into. See F-05 in FORENSIC_REMEDIATION_RECON.md.",
    ].join("\n")
  );
}


// Same seeded demo accounts the Vitest suite uses (see STATUS.md). The
// technician account deliberately has NO maintenance.staff row — it is how
// the non-staff paths get exercised.
export const ACCOUNTS = {
  executive: {
    email: process.env.E2E_EXEC_EMAIL ?? "exec1@monarch.test",
    password: process.env.E2E_EXEC_PASSWORD ?? "Loop1TestPass!23",
  },
  manager: {
    email: process.env.E2E_MANAGER_EMAIL ?? "mgr1@monarch.test",
    password: process.env.E2E_MANAGER_PASSWORD ?? "Loop1TestPass!23",
  },
  technician: {
    email: process.env.E2E_TECH_EMAIL ?? "tech1@monarch.test",
    password: process.env.E2E_TECH_PASSWORD ?? "Loop1TestPass!23",
  },
} as const;

export type AccountName = keyof typeof ACCOUNTS;

export async function signIn(page: Page, account: AccountName) {
  const { email, password } = ACCOUNTS[account];
  await page.goto("/login");
  await page.getByRole("heading", { name: "MONARCH Maintenance" }).waitFor();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // A sign-in failure renders an inline error instead of navigating. Surface
  // that message rather than a bare "still on /login" timeout — this exact
  // path is where RISK-10 (the "Database error querying schema" login bug)
  // hid for five loops, and the message is what identified it.
  const inlineError = page.locator("form p.text-red-700");
  const landed = await Promise.race([
    page.waitForURL(/\/home$/, { timeout: 20_000 }).then(() => true),
    inlineError.waitFor({ timeout: 20_000 }).then(() => false),
  ]).catch(() => false);

  if (!landed) {
    const message = (await inlineError.textContent().catch(() => null))?.trim();
    throw new Error(
      `signIn(${account}) did not reach /home. ` +
        (message ? `Login page reported: "${message}"` : `No inline error shown; still on ${page.url()}`)
    );
  }
  await expect(page).toHaveURL(/\/home$/);
}

// Every row these tests create is tagged so it is trivially identifiable in
// the live project — same convention as the Vitest suite (tests/README.md).
export function e2eSymptom(label: string): string {
  // Same [run=...] marker as the Vitest suite. The e2e job carries its own
  // MAINTENANCE_TEST_RUN_ID suffix, so the two jobs of one workflow run cannot
  // clean up each other's rows either. See tests/run-tag.ts.
  return `[AUTOTEST-E2E]${runMarker()} ${label} (${new Date().toISOString()})`;
}

// Loop 66: /cases/new became a 4-step progressive flow (What happened? /
// Where? / Anything else? / Review) instead of one flat form — this walks
// through it exactly as a real user would (fill symptom, Next x3, Submit),
// rather than trying to reach into a later step directly.
export async function reportCase(page: Page, symptom: string): Promise<string> {
  await page.goto("/cases/new");
  await page.locator("textarea").fill(symptom);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Submit case" }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const caseId = page.url().split("/").pop()!;
  return caseId;
}
