import { test, expect } from "@playwright/test";
import { signIn, reportCase, e2eSymptom } from "./helpers";

// Role gating and notification delivery, exercised through the real UI.
// These are the paths where a server-side rule can be correct while the UI
// still shows the wrong thing to the wrong person — which is its own kind of
// defect (§36.3: the UI is not the enforcement mechanism, but it must not
// contradict it either).

test("a non-staff user does not get the PM surface (§17 is staff-only)", async ({ page }) => {
  await signIn(page, "technician");

  // The staff-only PM nav link must not be rendered for them at all.
  await expect(page.getByRole("link", { name: "PM", exact: true })).toHaveCount(0);

  // And visiting it directly must show the staff-only notice, not an empty
  // or broken plan list.
  await page.goto("/pm");
  await expect(
    page.getByText(/visible to Maintenance staff only/i)
  ).toBeVisible({ timeout: 20_000 });
});

test("staff see the PM surface and a Manager can approve a recurring plan (§17.3)", async ({
  page,
}) => {
  await signIn(page, "manager");
  await page.getByRole("link", { name: "PM", exact: true }).click();
  await expect(page).toHaveURL(/\/pm$/);
  await expect(page.getByRole("heading", { name: "Preventive Maintenance" })).toBeVisible();

  const title = e2eSymptom("monthly lube check");
  await page.locator('input[placeholder="Title"]').fill(title);
  await page.locator('input[placeholder="Frequency (days)"]').fill("30");
  await page.getByRole("button", { name: "Create plan" }).click();

  // A freshly proposed RECURRING plan must show as awaiting approval —
  // never as already approved.
  const planCard = page.getByTestId("pm-plan-card").filter({ hasText: title });
  await expect(planCard.getByText("Awaiting Manager approval")).toBeVisible({
    timeout: 20_000,
  });

  await planCard.getByRole("button", { name: "Approve" }).click();
  await expect(planCard.getByText(/^Approved /)).toBeVisible({ timeout: 20_000 });
});

test("acknowledging a case notifies the reporter, and only the reporter (§23)", async ({
  browser,
}) => {
  // Reporter (a non-staff technician identity) files the case.
  const reporterContext = await browser.newContext();
  const reporterPage = await reporterContext.newPage();
  await signIn(reporterPage, "technician");
  const symptom = e2eSymptom("notification delivery");
  const caseId = await reportCase(reporterPage, symptom);
  // The notification text identifies the case by number, so assertions below
  // can be scoped to this case rather than to text that also appears in page
  // headings.
  const caseNumber = (await reporterPage.locator("p.font-mono").first().innerText()).trim();

  // A different person (staff) acknowledges it.
  const execContext = await browser.newContext();
  const execPage = await execContext.newPage();
  await signIn(execPage, "executive");
  await execPage.goto(`/cases/${caseId}`);
  await expect(execPage.getByText("Acknowledge this case")).toBeVisible();
  await execPage.getByRole("button", { name: "Acknowledge & take ownership" }).click();
  await expect(execPage.getByText("Status: ACKNOWLEDGED")).toBeVisible({ timeout: 20_000 });

  // The reporter must now have an unread notification naming who acknowledged.
  await reporterPage.reload();
  const bell = reporterPage.getByRole("button", { name: /Notifications/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(
    reporterPage
      .getByTestId("notification-panel")
      .getByText(new RegExp(`${caseNumber} has been acknowledged by`))
  ).toBeVisible({ timeout: 20_000 });

  // The acknowledging Executive must NOT receive that notification —
  // notifications are recipient-scoped by RLS and the UI must reflect it.
  // Scoped to the notification panel on purpose: the case number also appears
  // in the page heading, which is not what is being asserted here.
  await execPage.reload();
  await execPage.getByRole("button", { name: /Notifications/ }).click();
  await expect(
    execPage.getByTestId("notification-panel").getByText(new RegExp(caseNumber))
  ).toHaveCount(0);

  await reporterContext.close();
  await execContext.close();
});

test("spare request over ₹12,000 shows as needing Manager approval (§3.3)", async ({ page }) => {
  await signIn(page, "executive");
  const symptom = e2eSymptom("spare approval gate");
  await reportCase(page, symptom);

  await page.locator('input[placeholder="Spare name"]').fill("Gearbox assembly");
  await page.locator('input[placeholder="Quantity"]').first().fill("1");
  await page.locator('input[placeholder="Estimated amount (₹, optional)"]').fill("25000");
  await page.getByRole("button", { name: "Raise request" }).click();

  // The threshold decision is server-side; the UI must show the resulting
  // state rather than deciding it locally.
  await expect(
    page.getByText(/Exceeds ₹12,000 — awaiting Manager approval/)
  ).toBeVisible({ timeout: 20_000 });

  // An Executive (not Manager) must not be offered the approve control.
  await expect(
    page.locator('input[placeholder="Approval proof reference"]')
  ).toHaveCount(0);
});
