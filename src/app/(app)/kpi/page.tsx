import { createClient } from "@/lib/supabase/server";
import type { MaintenanceCase, CaseCurrentImpact } from "@/lib/supabase/database.types";
import { StatCard, Icons } from "@/components/stat-card";

// §25 KPI reporting.
//
// This page is deliberately conservative, because §25.2 ends with three rules
// that are easy to break by accident:
//
//   1. "Missing data must NOT silently become zero." Every measure below
//      reports its own coverage — how many cases it was actually computed
//      from. A metric derived from 3 of 40 cases is shown as such, and a
//      metric with no data at all reads "no data", never "0".
//   2. "Financial impact must use an authoritative source/basis." Spare
//      request amounts are ESTIMATES entered by Maintenance, not an
//      authoritative costing, and §24 lists fabricating financial impact as
//      NEVER AUTOMATE. So there is no ₹ headline here — the estimates are
//      shown labelled as estimates, with unpriced requests counted separately
//      instead of being folded in as zero.
//   3. "Do not invent KPI targets or SLAs." Nothing here is coloured
//      good/bad, and no number is compared against a threshold — because no
//      approved threshold exists.
//
// §18 recurrence / §19 CAPA (Loop 15) ARE built — this page previously said
// otherwise, which was stale by the time Loop 21 re-read it against the live
// schema. A recurrence-flag or CAPA count of 0 here is a REAL zero (the
// detector ran, or would run, and found nothing / nothing was raised), not
// a "missing data" zero — that distinction only matters for the downtime /
// output-loss measures above, where a case can simply have no impact record
// yet. §18 detection itself stays dormant by construction until PENDING-04
// is closed (see STATUS.md); that is stated explicitly below rather than
// left for the reader to infer from an unexplained zero.

const TERMINAL = ["CLOSED", "REJECTED", "DUPLICATE"];

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fmtHours(h: number | null): string {
  if (h === null) return "no data";
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

export default async function KpiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!staffRow) {
    return (
      <p className="rounded-lg border border-dashed border-line2 p-6 text-center text-sm text-muted">
        KPI reporting is visible to Maintenance staff only.
      </p>
    );
  }

  // Loop 37 (performance): ten independent aggregate reads. They used to run
  // one `await` at a time — ten sequential round trips before this page could
  // render a single number. Issued together now; no query changed.
  const [
    { data: caseRows },
    { data: waitRows },
    { data: impactRows },
    { data: pmRows },
    { data: recurrenceRows },
    { data: capaRows },
    { data: activeRuleRows },
    { data: reopenEvents },
    { data: spareRows },
    { data: restorationRows },
  ] = await Promise.all([
    supabase
      .from("cases")
      .select(
        "id, status, created_at, acknowledged_at, technically_restored_at, maintenance_released_at, closed_at, emergency_confirmed, production_started_without_release, production_not_restarted, current_owner_user_id"
      ),
    supabase.from("waits").select("case_id, entered_at, resumed_at, last_escalated_at"),
    supabase.from("case_current_impact").select("case_id, downtime_minutes, output_loss_kg"),
    supabase.from("pm_instances").select("id, status"),
    supabase.from("recurrence_flags").select("id, status"),
    supabase.from("capa_links").select("id, status, source"),
    supabase.from("recurrence_rules").select("id").eq("is_active", true),
    supabase.from("case_events").select("case_id").eq("event_type", "REOPENED"),
    supabase.from("spare_requests").select("id, estimated_amount, requires_manager_approval, approved_at"),
    supabase.from("restorations").select("case_id, restoration_type, follow_up_required"),
  ]);

  const cases = (caseRows ?? []) as Pick<
    MaintenanceCase,
    | "id"
    | "status"
    | "created_at"
    | "acknowledged_at"
    | "technically_restored_at"
    | "maintenance_released_at"
    | "closed_at"
    | "emergency_confirmed"
    | "production_started_without_release"
    | "production_not_restarted"
    | "current_owner_user_id"
  >[];
  const total = cases.length;
  const open = cases.filter((c) => !TERMINAL.includes(c.status));

  // --- Group 2: Restoration & Execution -----------------------------------
  const ackHours = cases
    .filter((c) => c.acknowledged_at)
    .map((c) => hoursBetween(c.created_at, c.acknowledged_at!));
  const restoreHours = cases
    .filter((c) => c.technically_restored_at)
    .map((c) => hoursBetween(c.created_at, c.technically_restored_at!));
  const closeHours = cases
    .filter((c) => c.closed_at)
    .map((c) => hoursBetween(c.created_at, c.closed_at!));

  // --- Group 3: Production Impact (minutes + kg) ---------------------------
  const impacts = (impactRows ?? []) as Pick<
    CaseCurrentImpact,
    "case_id" | "downtime_minutes" | "output_loss_kg"
  >[];
  // Only cases where the measure was actually recorded contribute. A case with
  // no impact record is absent from the average, not counted as zero.
  const downtimeValues = impacts
    .map((r) => r.downtime_minutes)
    .filter((v): v is number => v !== null);
  const outputLossValues = impacts
    .map((r) => r.output_loss_kg)
    .filter((v): v is number => v !== null);
  const downtimeTotal = downtimeValues.reduce((a, b) => a + b, 0);
  const outputLossTotal = outputLossValues.reduce((a, b) => a + b, 0);

  // --- Group 5: Waiting / Dependency --------------------------------------
  const waits = (waitRows ?? []) as {
    case_id: string;
    entered_at: string;
    resumed_at: string | null;
    last_escalated_at: string | null;
  }[];
  const resolvedWaitHours = waits
    .filter((w) => w.resumed_at)
    .map((w) => hoursBetween(w.entered_at, w.resumed_at!));
  const activeWaits = waits.filter((w) => !w.resumed_at);
  const escalatedWaits = waits.filter((w) => w.last_escalated_at);

  // --- Group 4: Preventive Maintenance ------------------------------------
  const pm = (pmRows ?? []) as { id: string; status: string }[];
  const pmOverdue = pm.filter((p) => p.status === "OVERDUE").length;
  const pmCompleted = pm.filter((p) => p.status === "COMPLETED").length;

  // --- Group 6: Recurrence & CAPA (§18/§19) -------------------------------
  // Real zeros, not "no data" — see the comment block at the top of this
  // file for why that distinction matters here.
  const recurrenceFlags = (recurrenceRows ?? []) as { id: string; status: string }[];
  const recurrenceSuspected = recurrenceFlags.filter((r) => r.status === "SUSPECTED").length;
  const recurrenceConfirmed = recurrenceFlags.filter((r) => r.status === "CONFIRMED").length;
  const recurrenceDismissed = recurrenceFlags.filter((r) => r.status === "DISMISSED").length;
  const activeRecurrenceRules = (activeRuleRows ?? []).length;

  const capaLinks = (capaRows ?? []) as { id: string; status: string; source: string }[];
  const capaOpen = capaLinks.filter((c) => c.status === "OPEN").length;
  const capaEffective = capaLinks.filter((c) => c.status === "VERIFIED_EFFECTIVE").length;
  const capaNotEffective = capaLinks.filter((c) => c.status === "VERIFIED_NOT_EFFECTIVE").length;
  const capaSystemSuggested = capaLinks.filter((c) => c.source === "SYSTEM_SUGGESTED").length;

  // --- Group 7: Quality / Closure -----------------------------------------
  const reopenedCaseIds = new Set((reopenEvents ?? []).map((e) => e.case_id as string));
  const boundaryBreaches = cases.filter((c) => c.production_started_without_release).length;
  const notRestarted = cases.filter((c) => c.production_not_restarted).length;

  // §10: a TEMPORARY restoration always generates a permanent-repair
  // follow-up responsibility (Loop 22) — restorations.follow_up_required is
  // set true only for those. Counted here for the same reason recurrence/CAPA
  // are: the mechanism exists but nothing previously reported on it.
  const restorations = (restorationRows ?? []) as {
    case_id: string;
    restoration_type: string;
    follow_up_required: boolean;
  }[];
  const temporaryRestorations = restorations.filter((r) => r.restoration_type === "TEMPORARY");
  const casesWithTemporaryRestoration = new Set(temporaryRestorations.map((r) => r.case_id)).size;

  // --- Group 8: Financial Impact -------------------------------------------
  const spares = (spareRows ?? []) as {
    id: string;
    estimated_amount: number | null;
    requires_manager_approval: boolean;
    approved_at: string | null;
  }[];
  const pricedSpares = spares.filter((s) => s.estimated_amount !== null);
  const unpricedSpares = spares.length - pricedSpares.length;
  const estimateTotal = pricedSpares.reduce((a, s) => a + (s.estimated_amount ?? 0), 0);
  const awaitingApproval = spares.filter(
    (s) => s.requires_manager_approval && !s.approved_at
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-fg">KPIs</h1>
        <p className="mt-1 text-xs text-muted">
          Every measure shows the number of cases it was actually computed from.
          Nothing here is compared against a target, because the approved design
          defines no KPI targets or SLAs.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Total cases" value={total} icon={Icons.clipboard} tone="info" />
        <StatCard label="Open now" value={open.length} icon={Icons.clock} tone="neutral" />
        <StatCard
          label="PM overdue"
          value={pmOverdue}
          tone={pmOverdue ? "warn" : "neutral"}
          icon={Icons.warning}
        />
        <StatCard
          label="Recurrence flags (suspected)"
          value={recurrenceSuspected}
          tone={recurrenceSuspected ? "warn" : "neutral"}
          icon={Icons.check}
        />
      </section>

      <Group title="Restoration & execution">
        <Metric
          label="Time to acknowledge (median)"
          value={fmtHours(median(ackHours))}
          coverage={`${ackHours.length} of ${total} cases`}
        />
        <Metric
          label="Time to technical restoration (median)"
          value={fmtHours(median(restoreHours))}
          coverage={`${restoreHours.length} of ${total} cases`}
        />
        <Metric
          label="Time to closure (median)"
          value={fmtHours(median(closeHours))}
          coverage={`${closeHours.length} of ${total} cases`}
        />
      </Group>

      <Group title="Production impact">
        <Metric
          label="Downtime recorded (total)"
          value={
            downtimeValues.length ? `${downtimeTotal.toLocaleString()} min` : "no data"
          }
          coverage={`recorded on ${downtimeValues.length} of ${total} cases`}
        />
        <Metric
          label="Downtime per case (median)"
          value={
            downtimeValues.length ? `${median(downtimeValues)!.toLocaleString()} min` : "no data"
          }
          coverage={`from ${downtimeValues.length} recorded ${
            downtimeValues.length === 1 ? "case" : "cases"
          }`}
        />
        <Metric
          label="Output loss recorded (total)"
          value={
            outputLossValues.length ? `${outputLossTotal.toLocaleString()} kg` : "no data"
          }
          coverage={`recorded on ${outputLossValues.length} of ${total} cases`}
        />
        <p className="col-span-full text-xs text-muted">
          Cases with no recorded figure are excluded from these totals — they are
          not counted as zero. A total is only as complete as its coverage line.
        </p>
      </Group>

      <Group title="Waiting / dependency">
        <Metric
          label="Wait duration (median)"
          value={fmtHours(median(resolvedWaitHours))}
          coverage={`${resolvedWaitHours.length} resolved ${
            resolvedWaitHours.length === 1 ? "wait" : "waits"
          }`}
        />
        <Metric
          label="Currently waiting"
          value={String(activeWaits.length)}
          coverage={`${waits.length} waits recorded in total`}
        />
        <Metric
          label="Waits that hit escalation"
          value={String(escalatedWaits.length)}
          coverage="§7.2 24h timer"
        />
      </Group>

      <Group title="Preventive maintenance">
        <Metric label="PM overdue" value={String(pmOverdue)} coverage={`${pm.length} instances`} />
        <Metric label="PM completed" value={String(pmCompleted)} coverage={`${pm.length} instances`} />
      </Group>

      <Group title="Ownership / workload">
        <Metric label="Open cases" value={String(open.length)} coverage={`${total} cases total`} />
        <Metric
          label="Unowned open cases"
          value={String(open.filter((c) => !c.current_owner_user_id).length)}
          coverage="no current Maintenance owner"
        />
      </Group>

      <Group title="Quality / closure">
        <Metric
          label="Cases reopened at least once"
          value={String(reopenedCaseIds.size)}
          coverage={`${total} cases`}
        />
        <Metric
          label="Cases with a temporary restoration (§10)"
          value={String(casesWithTemporaryRestoration)}
          coverage={`${temporaryRestorations.length} temporary restoration${
            temporaryRestorations.length === 1 ? "" : "s"
          } recorded, each generating a permanent-repair follow-up`}
        />
        <Metric
          label="Confirmed emergencies"
          value={String(cases.filter((c) => c.emergency_confirmed).length)}
          coverage={`${total} cases`}
        />
        <Metric
          label="Production started without release (§13.1)"
          value={String(boundaryBreaches)}
          coverage={`${total} cases`}
        />
        <Metric
          label="Production not restarted (§13.2)"
          value={String(notRestarted)}
          coverage={`${total} cases`}
        />
      </Group>

      <Group title="Financial impact">
        <Metric
          label="Spare estimates on record"
          value={pricedSpares.length ? `₹${estimateTotal.toLocaleString("en-IN")}` : "no data"}
          coverage={`${pricedSpares.length} of ${spares.length} requests carry an amount`}
        />
        <Metric
          label="Requests with no amount"
          value={String(unpricedSpares)}
          coverage="excluded from the total above"
        />
        <Metric
          label="Awaiting Manager approval (> ₹12,000)"
          value={String(awaitingApproval)}
          coverage="§3.3 authority boundary"
        />
        <p className="col-span-full rounded-lg bg-warn/10 p-2 text-xs text-amber-300">
          These are <strong>Maintenance-entered estimates</strong>, not an
          authoritative costing. §25.2 requires financial impact to come from an
          authoritative source, and §24 lists fabricating financial impact as
          never-automate — so this module does not present a ₹ cost-of-
          maintenance figure. Requests with no amount are counted separately
          above rather than being added in as ₹0.
        </p>
      </Group>

      <Group title="Recurrence & CAPA (§18 / §19)">
        <Metric
          label="Recurrence flags — suspected"
          value={String(recurrenceSuspected)}
          coverage="awaiting Executive/Manager confirmation"
        />
        <Metric
          label="Recurrence flags — confirmed"
          value={String(recurrenceConfirmed)}
          coverage="§18"
        />
        <Metric
          label="Recurrence flags — dismissed"
          value={String(recurrenceDismissed)}
          coverage="§18"
        />
        <Metric
          label="Active recurrence rules"
          value={String(activeRecurrenceRules)}
          coverage="PENDING-04 — 0 until the Boss supplies a threshold"
        />
        <Metric label="CAPA — open" value={String(capaOpen)} coverage="§19" />
        <Metric
          label="CAPA — verified effective"
          value={String(capaEffective)}
          coverage="Manager-verified"
        />
        <Metric
          label="CAPA — verified NOT effective"
          value={String(capaNotEffective)}
          coverage="a real result, not a missing answer"
        />
        <Metric
          label="CAPA — system-suggested"
          value={String(capaSystemSuggested)}
          coverage="labelled as suggested, never auto-certified"
        />
        <p className="col-span-full text-xs text-muted">
          The mechanism has existed since Loop 15. These are real counts, not
          placeholders — a 0 here means the detector ran (or would run) and
          found nothing, not that the feature is unbuilt. Detection stays
          dormant with {activeRecurrenceRules} active recurrence rule
          {activeRecurrenceRules === 1 ? "" : "s"} configured, per PENDING-04.
        </p>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  coverage,
}: {
  label: string;
  value: string;
  coverage: string;
}) {
  const noData = value === "no data";
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`text-lg font-semibold ${
          noData ? "italic text-muted2" : "text-fg"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted2">{coverage}</p>
    </div>
  );
}
