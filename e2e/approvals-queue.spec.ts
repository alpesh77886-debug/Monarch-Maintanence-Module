import { test, expect } from "@playwright/test";
import { signInAs, testSymptom } from "../tests/helpers";
import { signIn } from "./helpers";

// Loop 118 (Boss: "Manager ke 4 screens" — mockup screen 2, "Manager —
// Approvals Queue"). `/approvals` aggregates pending spare approvals
// (>₹12,000, §3.3) across every case — arrangement here matches
// tests/spares.test.ts's own proof that raise_spare_request computes
// requires_manager_approval from the real ₹12,000 threshold server-side;
// this spec only proves the new page's own read + role gate, not that
// threshold logic again.

test("Manager sees a pending >₹12,000 spare request on /approvals; Executive is turned away", async ({
  page,
  browser,
}) => {
  const exec = await signInAs("executive");
  const spareName = testSymptom("e2e approvals queue spare");

  const { data: created, error: createErr } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom("e2e approvals queue case"),
      reporter_user_id: exec.userId,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  const caseId = created!.id as string;

  const { error: raiseErr } = await exec.client.rpc("raise_spare_request", {
    p_case_id: caseId,
    p_spare_name: spareName,
    p_quantity_requested: 1,
    p_estimated_amount: 18500,
  });
  if (raiseErr) throw raiseErr;

  await signIn(page, "manager");
  await page.goto("/approvals");
  await expect(page.getByText(spareName)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("₹18,500")).toBeVisible();

  const execContext = await browser.newContext();
  const execPage = await execContext.newPage();
  await signIn(execPage, "executive");
  await execPage.goto("/approvals");
  await expect(execPage.getByText("Approvals is visible to Maintenance Managers only.")).toBeVisible();
  await expect(execPage.getByText(spareName)).toHaveCount(0);
  await execContext.close();
});
