import { test, expect } from "@playwright/test";
import { signInAs, testSymptom } from "../tests/helpers";
import { signIn } from "./helpers";

// Loop 112: a more severe sibling of Loop 111's RISK-35 finding, found by
// the same method — reading the actual live RLS policies against what the
// UI/RPC layer already assumes, rather than trusting a shipped feature
// works because its RPC-level tests pass.
//
// F-01 (migration 0031, §1/§43.8) deliberately made the QC-authority
// identity NOT a maintenance.staff row — QC clearance truth is meant to sit
// outside Maintenance's ownership, enforced by maintenance.is_qc_authority()
// inside qc_decision's own guard. But nothing on the read side was ever
// updated to match: cases_select never had a QC-authority branch (only
// staff / the case's own reporter / an assigned technician), and
// clearances_select was staff-only since this schema's very first RLS pass,
// before qc_authority even existed. The QC-authority identity therefore
// could not even load /cases/[id] for the case they were meant to clear —
// the page's own first query (the case row itself) returned null under
// RLS. On top of that, qcTab in page.tsx was gated on isStaffRow alone, so
// even a fixed read scope would still have kept the tab itself hidden.
// Neither gap was ever caught by tests/qc-and-restoration.test.ts, which
// calls qc_decision directly via RPC and never exercises the page's read
// queries or its tab visibility at all — exactly the class of bug this e2e
// suite exists to catch (case-flow.spec.ts's own header comment).
//
// Fixed this same loop: migration 0056 extends maintenance.can_read_case()
// (and the equivalent inline expression in cases_select) with a
// QC-authority branch scoped to cases that actually have a clearances row
// — not a blanket all-cases grant — plus the matching branch on
// clearances_select; and qcTab's gate became `isStaffRow || isQcAuthority`.
// Documented as RISK-36 in RISK_REGISTER.md.
//
// This suite arranges scenario state via the same real RPCs
// tests/qc-and-restoration.test.ts already proves correct, then drives only
// the actual UI surface through the real browser — see
// e2e/lifecycle-authority.spec.ts's header comment for why arrangement is
// done this way rather than a full UI lifecycle walk. Case rows carry the
// same [AUTOTEST] + [run=...] tagging every other case in this suite uses,
// so the existing e2e/global-teardown.ts cleanup removes them with no new
// cleanup code.

async function arrangeSentToQc(label: string): Promise<string> {
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

  const { error: qcReqErr } = await exec.client.rpc("set_qc_required", {
    p_case_id: caseId,
    p_qc_required: true,
    p_reason: "e2e arrangement: QC required",
  });
  if (qcReqErr) throw qcReqErr;

  const { error: restoreErr } = await exec.client.rpc("record_restoration", {
    p_case_id: caseId,
    p_restoration_type: "TECHNICAL",
    p_details: "e2e arrangement",
  });
  if (restoreErr) throw restoreErr;

  const { error: sendErr } = await exec.client.rpc("send_to_qc", { p_case_id: caseId });
  if (sendErr) throw sendErr;

  return caseId;
}

test("QC-authority identity (non-staff) can reach and decide the QC gate in the UI (RISK-36)", async ({
  page,
  browser,
}) => {
  const caseId = await arrangeSentToQc("e2e qc gate");

  // Executive (staff, not QC authority): QcPanel's own design — told what
  // is happening, never shown decision buttons the RPC would refuse.
  await signIn(page, "executive");
  await page.goto(`/cases/${caseId}`);
  await expect(page.getByText("Status: CLEARANCE_PENDING")).toBeVisible();
  await page.getByRole("tab", { name: "QC" }).click();
  await expect(page.getByText(/awaiting QC decision/)).toBeVisible();
  await expect(page.getByRole("button", { name: "QC cleared" })).toHaveCount(0);

  // QC-authority identity, in a fresh context: before this loop's fix, this
  // identity — deliberately not staff — could not load this page at all
  // (cases_select had no QC-authority branch), and the QC tab was hidden
  // outright regardless (qcTab was gated on isStaffRow alone).
  const qcContext = await browser.newContext();
  const qcPage = await qcContext.newPage();
  await signIn(qcPage, "qc");
  await qcPage.goto(`/cases/${caseId}`);
  await expect(qcPage.getByText("Status: CLEARANCE_PENDING")).toBeVisible();
  await qcPage.getByRole("tab", { name: "QC" }).click();
  await expect(qcPage.getByRole("button", { name: "QC cleared" })).toBeVisible();
  await qcPage.getByRole("button", { name: "QC cleared" }).click();
  await expect(qcPage.getByText("Status: MAINTENANCE_RELEASED")).toBeVisible({ timeout: 20_000 });
  await qcContext.close();
});
