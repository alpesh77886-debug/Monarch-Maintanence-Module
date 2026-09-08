import { test, expect } from "@playwright/test";
import { signIn, reportCase, e2eSymptom } from "./helpers";

// The browser-level counterpart to tests/lifecycle.test.ts: that suite calls
// the RPCs directly, this one drives the actual forms. The gap between the
// two is exactly where RISK-10 (login) and RISK-12 (a dead-end button that
// always failed) lived — both were UI-wiring bugs the backend tests could
// not have caught.

test("no console or page errors on the signed-out login page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "MONARCH Maintenance" })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(errors, `browser errors on /login:\n${errors.join("\n")}`).toEqual([]);
});

test("unauthenticated visit to /cases redirects to this app's own login", async ({ page }) => {
  await page.goto("/cases");
  // Must land on OUR /login, not a Vercel SSO wall (RISK-08 regression guard).
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "MONARCH Maintenance" })).toBeVisible();
});

test("executive can sign in, report a case, acknowledge it, and journal against it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await signIn(page, "executive");

  const symptom = e2eSymptom("conveyor motor overheating");
  await reportCase(page, symptom);

  // The case detail page should show what was just reported, in REPORTED.
  await expect(page.getByRole("heading", { name: symptom })).toBeVisible();
  await expect(page.getByText("Status: REPORTED")).toBeVisible();

  // Acknowledge (this is acknowledge_case: ownership + priority + status, and
  // since Loop 7 also a notification to the reporter). Since Loop 51, this
  // form opens as a bottom sheet from the sticky primary-action trigger
  // rather than rendering inline — open it first.
  await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(page.getByText("Acknowledge this case")).toBeVisible();
  await page.locator("form select").first().selectOption("HIGH");
  await page
    .locator('label:has-text("Initial assessment") input')
    .fill("Likely bearing failure");
  await page.getByRole("button", { name: "Acknowledge & take ownership" }).click();

  await expect(page.getByText("Status: ACKNOWLEDGED")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Priority: HIGH")).toBeVisible();

  // Journal entry (§24 Observation + Action Continuity Journal). Since
  // Loop 51 this panel lives in the Journal tab, not the default Overview.
  await page.getByRole("tab", { name: "Journal" }).click();
  const observation = "Motor casing hot to touch, unusual noise";
  await page.getByText("+ Add observation / action entry").click();
  await page.locator('label:has-text("Observation") textarea').fill(observation);
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText(observation)).toBeVisible({ timeout: 20_000 });

  // Audit trail must show the acknowledgement transition — append-only
  // history is a locked requirement (§27), so it has to be visible, not just
  // stored. Since Loop 51 this lives in the Audit tab.
  await page.getByRole("tab", { name: "Audit" }).click();
  await expect(page.getByText(/REPORTED → ACKNOWLEDGED/)).toBeVisible();

  expect(errors, `browser errors during case flow:\n${errors.join("\n")}`).toEqual([]);
});

test("emergency claim/confirm two-step is enforced in the UI (§6)", async ({ page }) => {
  await signIn(page, "executive");
  const symptom = e2eSymptom("emergency two-step");
  await reportCase(page, symptom);

  // Claim requires a reason before the RPC will accept it.
  await expect(page.getByText("Claim Emergency / Safety-Critical")).toBeVisible();
  await page.getByRole("button", { name: "Claim Emergency" }).click();
  await expect(
    page.getByText(/reason\/evidence is required/i)
  ).toBeVisible();

  await page
    .locator('textarea[placeholder="Reason/evidence for the emergency claim"]')
    .fill("Sparking panel next to operator station");
  await page.getByRole("button", { name: "Claim Emergency" }).click();

  // After claiming, the panel must switch to the awaiting-confirmation state —
  // a claim alone must never read as a confirmed emergency (§6: the 1h clock
  // starts only at confirmation).
  await expect(
    page.getByText(/claimed — awaiting Executive\/Manager confirmation/i)
  ).toBeVisible({ timeout: 20_000 });

  await page
    .getByRole("button", { name: /Confirm Emergency/ })
    .click();
  await expect(page.getByText("Confirmed Emergency / Safety-Critical")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/1h escalation clock is running/)).toBeVisible();
});
