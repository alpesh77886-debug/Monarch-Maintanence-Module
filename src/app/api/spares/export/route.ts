import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Boss-requested (Gate 22, Loop 108): a full spare-consumption report,
// downloadable as a real .xlsx from the "Spare Consumption" page
// (src/app/(app)/spares/page.tsx) — every field the Boss named: which
// spare, how much, where used (case/area/line/machine), who did it, which
// date, which machine. §16.3: Maintenance records usage, this endpoint only
// reads maintenance.spare_usage/spare_requests/cases — it invents no new
// inventory truth.
//
// Staff-only: spare_usage_select's own RLS (migration 0002) already lets
// is_staff() read every case's usage, but a non-staff technician's RLS
// scope is their OWN usage only — a cross-case consumption report is a
// management/audit artifact, not a self-service one, so this route
// additionally refuses a signed-in non-staff caller outright rather than
// silently handing back a report scoped to just their own rows (which
// would look complete but not be).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!staffRow) {
    return NextResponse.json(
      { error: "Spare consumption export is visible to Maintenance staff only." },
      { status: 403 }
    );
  }

  const { data: usage, error } = await supabase
    .from("spare_usage")
    .select(
      "id, quantity, used_at, asset_ref, outcome, actor_user_id, stores_reference_status, stores_reference_id, case_id, spare_request_id"
    )
    .order("used_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const caseIds = [...new Set((usage ?? []).map((u) => u.case_id))];
  const requestIds = [...new Set((usage ?? []).map((u) => u.spare_request_id).filter((v): v is string => !!v))];

  const [{ data: cases }, { data: requests }, { data: staffList }] = await Promise.all([
    caseIds.length
      ? supabase.from("cases").select("id, case_number, symptom, area, line").in("id", caseIds)
      : Promise.resolve({ data: [] as { id: string; case_number: string; symptom: string; area: string | null; line: string | null }[] }),
    requestIds.length
      ? supabase.from("spare_requests").select("id, spare_name, estimated_amount").in("id", requestIds)
      : Promise.resolve({ data: [] as { id: string; spare_name: string; estimated_amount: number | null }[] }),
    // §29: staff is readable by any authenticated staff member (assignment/
    // ownership pickers already rely on this) — reused here purely to
    // resolve a name for display, same as every other panel in this app
    // (e.g. ownership-history's staffById.get(id)?.full_name ?? id).
    supabase.from("staff").select("id, full_name"),
  ]);

  const caseById = new Map((cases ?? []).map((c) => [c.id, c]));
  const requestById = new Map((requests ?? []).map((r) => [r.id, r]));
  const staffById = new Map((staffList ?? []).map((s) => [s.id, s.full_name]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MONARCH Maintenance";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Spare Consumption");

  sheet.columns = [
    { header: "Date", key: "date", width: 20 },
    { header: "Spare", key: "spare", width: 28 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Estimated Amount (Rs)", key: "amount", width: 20 },
    { header: "Case Number", key: "caseNumber", width: 14 },
    { header: "Case Symptom", key: "symptom", width: 32 },
    { header: "Area", key: "area", width: 16 },
    { header: "Line", key: "line", width: 16 },
    { header: "Machine / Asset", key: "asset", width: 22 },
    { header: "Used By", key: "usedBy", width: 22 },
    { header: "Outcome", key: "outcome", width: 24 },
    { header: "Stores Reference Status", key: "storesStatus", width: 22 },
    { header: "Stores Reference ID", key: "storesRef", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const u of usage ?? []) {
    const c = caseById.get(u.case_id);
    const r = u.spare_request_id ? requestById.get(u.spare_request_id) : undefined;
    sheet.addRow({
      date: new Date(u.used_at),
      spare: r?.spare_name ?? "(spare request not found)",
      quantity: u.quantity,
      amount: r?.estimated_amount ?? "",
      caseNumber: c?.case_number ?? "",
      symptom: c?.symptom ?? "",
      area: c?.area ?? "",
      line: c?.line ?? "",
      asset: u.asset_ref ?? "",
      usedBy: staffById.get(u.actor_user_id) ?? u.actor_user_id,
      outcome: u.outcome ?? "",
      storesStatus: u.stores_reference_status,
      storesRef: u.stores_reference_id ?? "",
    });
  }
  sheet.getColumn("date").numFmt = "yyyy-mm-dd hh:mm";

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `spare-consumption-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
