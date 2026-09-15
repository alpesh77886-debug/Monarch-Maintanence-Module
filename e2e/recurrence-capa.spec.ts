import { test, expect } from "@playwright/test";
import { signInAs, testSymptom } from "../tests/helpers";
import { signIn } from "./helpers";

// Loop 120 (Boss: "Manager ke 4 screens" — mockup screen 4, "Manager —
// Recurrence & CAPA"). `/recurrence-rules` (already the rule-configuration
// tool, Loop 23) now also shows a plant-wide list of open CAPA items —
// this spec proves a real one, raised via the existing tested `raise_capa`
// RPC (tests/recurrence-capa.test.ts covers its own guards), actually
// surfaces there.
//
// Not covered here: the "Suspected recurrence" section with real data —
// `recurrence_flags` rows are only ever created by `run_recurrence_scan`,
// which is cron-only and `permission denied` for every authenticated
// client (same reason tests/recurrence-capa.test.ts's own header gives for
// not arranging one at the RPC layer either). Nothing client-side can seed
// one, so this suite doesn't pretend to.

test("A raised CAPA surfaces on /recurrence-rules for staff", async ({ page }) => {
  const exec = await signInAs("executive");
  const mgr = await signInAs("manager");
  const capaTitle = testSymptom("e2e recurrence capa");

  const { data: created, error: createErr } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom("e2e recurrence capa case"),
      reporter_user_id: exec.userId,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  const caseId = created!.id as string;

  const { error: capaErr } = await exec.client.rpc("raise_capa", {
    p_case_id: caseId,
    p_title: capaTitle,
    p_owner_user_id: mgr.userId,
    p_corrective_action: "e2e arrangement: replace worn part",
  });
  if (capaErr) throw capaErr;

  await signIn(page, "manager");
  await page.goto("/recurrence-rules");
  await expect(page.getByText("CAPA actions (§19)")).toBeVisible();
  await expect(page.getByText(capaTitle)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("OPEN")).toBeVisible();
});
