import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui";
import AvailabilityToggle from "../availability-toggle";
import SignOutButton from "../sign-out-button";

// Loop 63 (Prompt §6, nav relabel): the bottom tab bar only has 5 slots
// (Cases/Control/PM/Spares/More per the mockup's own in-app tab bar).
// Recurrence and KPIs don't fit — this page is where they now live,
// matching Prompt §17's "secondary controls live in a surface such as More."
//
// Loop 71 (§17 "Mobile Header"): the global header used to show the
// Availability toggle and Sign Out unconditionally on mobile — real
// clutter, since both render as labeled pill/button controls, not icons.
// Both now live here instead for staff (who always have this page one
// bottom-nav tap away). Reuses the SAME components the header used —
// not a reimplementation — so Sign Out's shift-handover-warning logic
// (§22.1) is untouched.
const MORE_LINKS = [
  {
    href: "/recurrence-rules",
    title: "Recurrence & CAPA",
    sub: "Recurrence rules and corrective-action tracking",
  },
  {
    href: "/kpi",
    title: "KPIs",
    sub: "Impact, restoration time, and reporting",
  },
];

// Loop 118: Manager-only, same tile also lives on the home hub — kept here
// too since More is the one page every staff member already reaches from
// the bottom nav without a role-specific tile having to exist there.
const MANAGER_LINK = {
  href: "/approvals",
  title: "Approvals",
  sub: "Spare approvals and emergency confirmations awaiting your decision",
};

export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: isStaffRow } = await supabase
    .from("staff")
    .select("id, role, is_available")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isStaffRow) {
    return <EmptyState title="More is visible to Maintenance staff only." />;
  }

  const links = isStaffRow.role === "MAINTENANCE_MANAGER" ? [MANAGER_LINK, ...MORE_LINKS] : MORE_LINKS;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-fg">More</h1>
        <p className="text-sm text-muted">Recurrence, CAPA and reporting</p>
      </div>

      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-xl border border-line bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md active:bg-bg2"
            >
              <p className="text-sm font-medium text-fg">{link.title}</p>
              <p className="mt-1 text-xs text-muted">{link.sub}</p>
            </Link>
          </li>
        ))}
      </ul>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Account
        </h2>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-3.5 shadow-sm">
          <div>
            <p className="text-sm font-medium text-fg">Shift availability</p>
            <p className="mt-0.5 text-xs text-muted">Whether you can receive handovers.</p>
          </div>
          <AvailabilityToggle isAvailable={!!isStaffRow.is_available} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-3.5 shadow-sm">
          <p className="text-sm font-medium text-fg">Sign out</p>
          <SignOutButton />
        </div>
      </section>
    </div>
  );
}
