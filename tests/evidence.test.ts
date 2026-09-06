import { describe, it, expect } from "vitest";
import { signInAs, testSymptom } from "./helpers";

// Loop 18: §5.1 / §26 — evidence attachment/reference.
//
// `maintenance.evidence` has existed since Loop 1, with RLS already correct:
// `evidence_insert` lets any authenticated user attach evidence directly
// (with check (uploaded_by = auth.uid())) — no RPC gate, unlike almost every
// other table in this schema, and deliberately so: §5.1 lists evidence as an
// intake field, so the reporter needs to be able to attach it too, not just
// staff. Six loops in, nothing had ever written a row. This file is the
// first exercise of that existing policy, not a change to it — there is no
// new migration in this loop.

async function seedCase(label: string, actor: "executive" | "technician") {
  const session = await signInAs(actor);
  const { data } = await session.client
    .from("cases")
    .insert({
      case_type: "BREAKDOWN",
      symptom: testSymptom(label),
      reporter_user_id: session.userId,
    })
    .select("id")
    .single();
  return { session, caseId: data!.id as string };
}

describe("evidence — any authenticated user may attach it (§5.1)", () => {
  it("lets a non-staff reporter attach evidence to their own case", async () => {
    const { session, caseId } = await seedCase("evidence non-staff", "technician");

    const { error } = await session.client.from("evidence").insert({
      case_id: caseId,
      uploaded_by: session.userId,
      file_ref: testSymptom("photo-ref-001"),
      description: "cracked housing",
    });
    expect(error).toBeNull();

    const { data } = await session.client
      .from("evidence")
      .select("file_ref, description, uploaded_by")
      .eq("case_id", caseId)
      .single();
    expect(data!.uploaded_by).toBe(session.userId);
    expect(data!.description).toBe("cracked housing");
  });

  it("lets staff attach evidence too", async () => {
    const { caseId } = await seedCase("evidence staff", "technician");
    const exec = await signInAs("executive");

    const { error } = await exec.client.from("evidence").insert({
      case_id: caseId,
      uploaded_by: exec.userId,
      file_ref: testSymptom("inspection-report-ref"),
    });
    expect(error).toBeNull();
  });

  it("refuses an insert where uploaded_by does not match the caller", async () => {
    const { session, caseId } = await seedCase("evidence impersonation", "technician");
    const exec = await signInAs("executive");

    // Attempting to attribute evidence to someone else must fail — the RLS
    // check is `uploaded_by = auth.uid()`, not merely "any authenticated
    // insert", so this is the one guard actually worth asserting on a
    // policy that is otherwise deliberately permissive.
    const { error } = await session.client.from("evidence").insert({
      case_id: caseId,
      uploaded_by: exec.userId,
      file_ref: "impersonating the executive",
    });
    expect(error).not.toBeNull();
  });

  it("keeps every record — evidence is read-only once attached (append-only)", async () => {
    const { session, caseId } = await seedCase("evidence multiple", "technician");

    const { data: first } = await session.client
      .from("evidence")
      .insert({ case_id: caseId, uploaded_by: session.userId, file_ref: "ref-1" })
      .select("id")
      .single();
    await session.client.from("evidence").insert({
      case_id: caseId,
      uploaded_by: session.userId,
      file_ref: "ref-2",
    });

    const { data } = await session.client
      .from("evidence")
      .select("file_ref")
      .eq("case_id", caseId);
    expect(data?.length).toBe(2);

    // No UPDATE/DELETE policy exists on this table (§0 rule 6, §27), but with
    // RLS that means the write matches ZERO rows and PostgREST reports
    // success with no error — the same gotcha already documented in
    // emergency-and-notifications.test.ts for `notifications`. The only real
    // assertion is that the row is provably unchanged/still present.
    await session.client.from("evidence").update({ file_ref: "tampered" }).eq("case_id", caseId);
    const { data: unchanged } = await session.client
      .from("evidence")
      .select("file_ref")
      .eq("id", first!.id)
      .single();
    expect(unchanged!.file_ref).toBe("ref-1");

    await session.client.from("evidence").delete().eq("case_id", caseId);
    const { data: stillThere } = await session.client
      .from("evidence")
      .select("id")
      .eq("case_id", caseId);
    expect(stillThere?.length).toBe(2);
  });
});
