import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Loop 63 (Prompt §6, nav relabel): the bottom tab bar only has 5 slots
// (Cases/Control/PM/Spares/More per the mockup's own in-app tab bar).
// Recurrence and KPIs don't fit — this page is where they now live,
// matching Prompt §17's "secondary controls live in a surface such as More."
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

export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: isStaffRow } = await supabase
    .from("staff")
    .select("id")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!isStaffRow) {
    return (
      <p className="rounded-lg border border-dashed border-line2 p-6 text-center text-sm text-muted">
        More is visible to Maintenance staff only.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-fg">More</h1>
        <p className="text-sm text-muted">Recurrence, CAPA and reporting</p>
      </div>

      <ul className="flex flex-col gap-2">
        {MORE_LINKS.map((link) => (
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
    </div>
  );
}
