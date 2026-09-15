import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

// Loop 116/117 (Boss: "Manager ke 4 screens... Dashboard 7 charts" — Premium
// UI v2 mockup screen 1). Four of the mockup's 7 charts (case type, machine
// area, weekly case cycle-time, approved spare spend by area) were added to
// the existing shift dashboard, gated on `isManager` — Executive keeps the
// dashboard unchanged. This is a plain UI boolean gate, not a new RLS
// policy (unlike RISK-35/36 this segment: no read-scope changed, `cases`/
// `spare_requests` were already staff-readable), so the risk class here is
// smaller — but the same "gate exists in code vs. gate actually holds in
// the browser" gap is exactly what this suite exists to catch, so it still
// gets one direct check rather than being assumed correct from the diff.

test("Manager sees the extra dashboard analytics; Executive does not", async ({ page, browser }) => {
  await signIn(page, "manager");
  await page.goto("/dashboard");
  await expect(page.getByText("Cases by type (all time)")).toBeVisible();
  await expect(page.getByText(/Case cycle time/)).toBeVisible();
  // Loop 119 (mockup screen 3, "Team & Authority"): the Authority matrix
  // reference table, and specifically that it states the correct, current
  // rule for Reopen (Manager-only) rather than the mockup's own wrong claim
  // that Executive can reopen a case — this table is sourced from the
  // corrected AUTHORITY_MATRIX.md, not the mockup, precisely to avoid
  // shipping that error into the app.
  await expect(page.getByText("Authority matrix")).toBeVisible();
  await expect(page.getByText("Reopen case (§3.2)")).toBeVisible();

  const execContext = await browser.newContext();
  const execPage = await execContext.newPage();
  await signIn(execPage, "executive");
  await execPage.goto("/dashboard");
  await expect(execPage.getByText("Shift dashboard")).toBeVisible();
  await expect(execPage.getByText("Cases by type (all time)")).toHaveCount(0);
  await expect(execPage.getByText(/Case cycle time/)).toHaveCount(0);
  await expect(execPage.getByText("Authority matrix")).toHaveCount(0);
  await execContext.close();
});
