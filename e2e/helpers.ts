import { expect, type Page } from "@playwright/test";

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
    page.waitForURL(/\/cases$/, { timeout: 20_000 }).then(() => true),
    inlineError.waitFor({ timeout: 20_000 }).then(() => false),
  ]).catch(() => false);

  if (!landed) {
    const message = (await inlineError.textContent().catch(() => null))?.trim();
    throw new Error(
      `signIn(${account}) did not reach /cases. ` +
        (message ? `Login page reported: "${message}"` : `No inline error shown; still on ${page.url()}`)
    );
  }
  await expect(page).toHaveURL(/\/cases$/);
}

// Every row these tests create is tagged so it is trivially identifiable in
// the live project — same convention as the Vitest suite (tests/README.md).
export function e2eSymptom(label: string): string {
  return `[AUTOTEST-E2E] ${label} (${new Date().toISOString()})`;
}

export async function reportCase(page: Page, symptom: string): Promise<string> {
  await page.goto("/cases/new");
  await page.locator("textarea").fill(symptom);
  await page.getByRole("button", { name: "Submit case" }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const caseId = page.url().split("/").pop()!;
  return caseId;
}
