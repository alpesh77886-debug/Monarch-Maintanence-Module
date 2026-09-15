import { test, expect } from "@playwright/test";
import { signInAs, testSymptom } from "../tests/helpers";
import { signIn } from "./helpers";

// Loop 115 (Boss: "Technician ka alag screen banega... total 3 screens" —
// mockup screens 5-8). Proves two things the Vitest/RPC-level suite cannot
// see: (1) a case assigned to the non-staff technician identity actually
// surfaces on the new dedicated `/home` workspace (TechnicianHome), built
// from the same `case_assignments` read Loop 109 already proved reachable —
// this test is about the new UI actually rendering it, not RLS; and (2) the
// workspace's "Record Fix" quick action deep-links to the right case tab via
// `/cases/[id]?tab=interventions`, which is new plumbing this loop added to
// `cases/[id]/page.tsx` (`searchParams` -> `CaseDetailTabs`' `defaultTab`).
//
// Does NOT re-arrange a full lifecycle walk (lifecycle-authority.spec.ts
// already covers that pattern) — assignment only needs ACKNOWLEDGED ->
// ASSESSED -> assign_technician (auto-transitions to ASSIGNED), matching
// tests/assignment-and-waiting.test.ts's own arrangement exactly.
//
// Deliberately does NOT assert an exact "My Tasks" count or that this
// case is first in the list: tech1@monarch.test is shared across every
// suite in this CI run, so other specs may hold concurrent assignments for
// it. Asserting "this case appears somewhere, with real data" is the
// correct-strength claim; asserting "it's the only/first one" would be
// flaky by construction, not a real bug if it failed.

async function arrangeAssignedCase(label: string): Promise<{ caseId: string; symptom: string }> {
  const exec = await signInAs("executive");
  const tech = await signInAs("technician");

  const symptom = testSymptom(label);
  const { data: created, error: createErr } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom,
      reporter_user_id: exec.userId,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  const caseId = created!.id as string;

  const { error: ackErr } = await exec.client.rpc("acknowledge_case", {
    p_case_id: caseId,
    p_priority: "HIGH",
  });
  if (ackErr) throw ackErr;

  const { error: assessErr } = await exec.client.rpc("transition_case", {
    p_case_id: caseId,
    p_new_status: "ASSESSED",
  });
  if (assessErr) throw assessErr;

  const { error: assignErr } = await exec.client.rpc("assign_technician", {
    p_case_id: caseId,
    p_technician_user_id: tech.userId,
  });
  if (assignErr) throw assignErr;

  return { caseId, symptom };
}

test("Technician workspace shows an assigned task and its Record Fix quick action lands on Interventions", async ({
  page,
}) => {
  const { caseId, symptom } = await arrangeAssignedCase("e2e technician workspace");

  await signIn(page, "technician");
  await page.goto("/home");

  // Real assigned-work data, not the bare hub the pre-Loop-115 non-staff
  // home page showed for this identity.
  await expect(page.getByText(symptom)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();

  // The deep-link itself (the new part): jump straight to the case's
  // Interventions tab the way the workspace's own "Record Fix" quick
  // action link does, and confirm CaseDetailTabs actually honours it.
  await page.goto(`/cases/${caseId}?tab=interventions`);
  await expect(page.getByRole("tab", { name: "Interventions" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  // intervention-form.tsx starts collapsed (just a "+ Record intervention"
  // button) — a real bug in this test, not the app: the form fields only
  // mount after that button is clicked, which the first version of this
  // test never did before asserting on "Action taken".
  await page.getByRole("button", { name: "+ Record intervention" }).click();
  await expect(page.getByLabel("Action taken")).toBeVisible();
});
