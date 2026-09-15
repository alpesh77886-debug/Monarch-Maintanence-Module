import { test, expect } from "@playwright/test";
import { signInAs, testSymptom } from "../tests/helpers";
import { signIn } from "./helpers";

// Loop 111 (Gate 22 follow-up): closes the e2e gap Gate 21's report
// explicitly acknowledged and deferred — no browser-level coverage existed
// for the Reopen button (RISK-32) or the two dispute forms (RISK-33), only
// the RPC-level Vitest suite (tests/lifecycle.test.ts,
// tests/restoration-dispute.test.ts) plus a manual read of page.tsx's
// gating conditions.
//
// Driving the ENTIRE lifecycle to CLOSED / TECHNICALLY_RESTORED through
// Playwright clicks was the reason this was deferred at Gate 21 — no
// existing spec attempts a walk that long, and this sandbox cannot verify
// selectors locally (the egress proxy blocks direct Supabase access, so any
// broken selector would only surface after a push). Instead, this suite
// arranges scenario state via the SAME real RPCs the Vitest suite already
// proves correct — signed in as the seeded demo accounts, through real
// authority checks, not a service-role bypass — then drives ONLY the actual
// new UI surface through the real browser. That is exactly this suite's own
// stated purpose (case-flow.spec.ts's header comment): catching UI-wiring
// bugs the RPC-level tests cannot see, not re-proving authority the RPC
// tests already prove exhaustively.
//
// Case rows created here carry the same [AUTOTEST] + [run=...] tagging as
// every other case in this suite (testSymptom, imported from the Vitest
// helpers) — cleanup_test_cases_since matches on a literal '[AUTOTEST%'
// prefix regardless of which suite wrote it, so e2e/global-teardown.ts's
// existing cleanupRun("playwright", ...) call removes these rows exactly
// like every other case this job creates. No new cleanup code needed.
//
// This suite's first CI run found a real bug, exactly the class this suite
// exists to catch: restorations_select (migration 0002) was staff-only,
// so a non-staff reporter (§11's own complainant) could never actually see
// the DisputeRestorationForm — their own read of the case's restoration
// history returned zero rows under RLS, making canDisputeRestoration
// permanently false. The RPC-level Vitest suite never caught it because it
// calls raise_restoration_dispute directly, bypassing the page's read
// query. Fixed in migration 0055 (restorations now uses the same
// can_read_case scope every other case-scoped table already has).

async function arrangeClosedCase(label: string): Promise<string> {
  const exec = await signInAs("executive");

  const { data: created, error: createErr } = await exec.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: exec.userId,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  const caseId = created!.id as string;

  const { error: ackErr } = await exec.client.rpc("acknowledge_case", {
    p_case_id: caseId,
    p_priority: "MEDIUM",
  });
  if (ackErr) throw ackErr;

  for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: status,
    });
    if (error) throw error;
  }

  const { error: restoreErr } = await exec.client.rpc("record_restoration", {
    p_case_id: caseId,
    p_restoration_type: "TECHNICAL",
    p_details: "e2e arrangement",
  });
  if (restoreErr) throw restoreErr;

  const { error: qcErr } = await exec.client.rpc("set_qc_required", {
    p_case_id: caseId,
    p_qc_required: false,
    p_reason: "no QC needed for e2e arrangement",
  });
  if (qcErr) throw qcErr;

  const { error: releaseErr } = await exec.client.rpc("transition_case", {
    p_case_id: caseId,
    p_new_status: "MAINTENANCE_RELEASED",
  });
  if (releaseErr) throw releaseErr;

  const { error: closeErr } = await exec.client.rpc("transition_case", {
    p_case_id: caseId,
    p_new_status: "CLOSED",
    p_reason: "e2e arrangement: production resumed",
  });
  if (closeErr) throw closeErr;

  return caseId;
}

async function arrangeDisputableCase(label: string): Promise<string> {
  const exec = await signInAs("executive");
  const tech = await signInAs("technician");

  // cases_insert (migration 0026) requires reporter_user_id = auth.uid()
  // unconditionally — the insert must come from the reporter's own client.
  const { data: created, error: createErr } = await tech.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: tech.userId,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  const caseId = created!.id as string;

  const { error: ackErr } = await exec.client.rpc("acknowledge_case", {
    p_case_id: caseId,
    p_priority: "MEDIUM",
  });
  if (ackErr) throw ackErr;

  for (const status of ["ASSESSED", "ASSIGNED", "DIAGNOSING", "IN_REPAIR"]) {
    const { error } = await exec.client.rpc("transition_case", {
      p_case_id: caseId,
      p_new_status: status,
    });
    if (error) throw error;
  }

  const { data: restoration, error: restoreErr } = await exec.client.rpc("record_restoration", {
    p_case_id: caseId,
    p_restoration_type: "TECHNICAL",
    p_details: "e2e arrangement",
  });
  if (restoreErr) throw restoreErr;
  const restorationId = (restoration as { restoration_id: string }).restoration_id;

  const { error: verifyErr } = await exec.client.rpc("verify_restoration", {
    p_restoration_id: restorationId,
    p_passed: true,
  });
  if (verifyErr) throw verifyErr;

  return caseId;
}

test("Reopen is Manager-only in the UI, and actually reopens the case (RISK-32)", async ({
  page,
  browser,
}) => {
  const caseId = await arrangeClosedCase("e2e reopen authority");

  // Executive: close-reopen-actions.tsx gates the button on isManager, so an
  // Executive — even the case's own owning Executive — must not even be
  // offered it. The RPC itself also refuses (lifecycle.test.ts), but that is
  // exactly the layer this suite cannot see; this is the layer it can.
  await signIn(page, "executive");
  await page.goto(`/cases/${caseId}`);
  await expect(page.getByText("Status: CLOSED")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen (same problem recurred)" })).toHaveCount(
    0
  );

  // Manager, in a fresh browser context (not the Executive's signed-in
  // page): every other spec in this suite signs in once per test, on a
  // fresh Playwright-provided context, so signIn()'s own "goto /login, wait
  // for the heading" logic has never had to account for an already-signed-in
  // session on the same page. Switching roles mid-test needs the same fresh
  // start signIn() assumes, not a second /login visit on Executive's cookies
  // (which redirects straight past the heading and times out).
  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await signIn(managerPage, "manager");
  await managerPage.goto(`/cases/${caseId}`);
  await expect(managerPage.getByText("Status: CLOSED")).toBeVisible();
  managerPage.once("dialog", (dialog) => dialog.accept("e2e: same problem recurred"));
  await managerPage.getByRole("button", { name: "Reopen (same problem recurred)" }).click();
  await expect(managerPage.getByText("Status: REOPENED")).toBeVisible({ timeout: 20_000 });
  await managerContext.close();
});

test("complainant dispute + staff acknowledge round-trip works in the UI (RISK-33)", async ({
  page,
  browser,
}) => {
  const caseId = await arrangeDisputableCase("e2e dispute round-trip");

  // Technician (the case's own reporter): raise a dispute that the fix
  // didn't actually work.
  await signIn(page, "technician");
  await page.goto(`/cases/${caseId}`);
  await page.getByRole("tab", { name: "Restorations" }).click();
  await expect(page.getByText("Executive marked this as fixed. Still not working?")).toBeVisible();
  await page.getByRole("button", { name: "Machine still not okay" }).click();
  await page.getByLabel("What is still wrong?").fill("Still overheating after 10 minutes");
  await page.getByRole("button", { name: "Submit dispute" }).click();
  // A dispute now PENDING means canDisputeRestoration flips false — the
  // prompt must disappear, not stay offered for a second submission.
  await expect(
    page.getByText("Executive marked this as fixed. Still not working?")
  ).toHaveCount(0, { timeout: 20_000 });

  // Executive (staff, owns the case), in a fresh browser context — same
  // reason as the Reopen test above: signIn() needs a real signed-out start.
  const execContext = await browser.newContext();
  const execPage = await execContext.newPage();
  await signIn(execPage, "executive");
  await execPage.goto(`/cases/${caseId}`);
  await execPage.getByRole("tab", { name: "Restorations" }).click();
  await expect(
    execPage.getByText("Complainant disputes this restoration (§11) — record your decision")
  ).toBeVisible();
  await execPage.getByRole("button", { name: "Confirmed not fixed" }).click();
  await execPage.getByLabel("Reason (required)").fill("Confirmed still faulty, reopening repair");
  await execPage.getByRole("button", { name: "Confirm decision" }).click();
  await expect(execPage.getByText(/Status: (DIAGNOSING|IN_REPAIR)/)).toBeVisible({
    timeout: 20_000,
  });
  await execContext.close();
});
