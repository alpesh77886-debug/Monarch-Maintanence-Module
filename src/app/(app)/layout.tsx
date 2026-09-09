import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import NotificationBell from "./notification-bell";
import AvailabilityToggle from "./availability-toggle";
import AppNav from "./app-nav";
import type { AppNotification } from "@/lib/supabase/database.types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let staffName: string | null = null;
  let isStaff = false;
  let isAvailable = false;
  let notifications: AppNotification[] = [];
  if (user) {
    // Loop 37 (performance): this layout wraps EVERY page, so its round trips
    // are paid on every single navigation. The staff row and the unread
    // notifications are independent of each other — issued together rather
    // than one after the other. Neither query itself changed.
    const [{ data: staff }, { data: unread }] = await Promise.all([
      supabase.from("staff").select("full_name, role, is_available").eq("id", user.id).maybeSingle(),
      supabase
        .from("notifications")
        .select("*")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    staffName = staff ? `${staff.full_name} (${staff.role})` : user.email ?? null;
    isStaff = !!staff;
    isAvailable = !!staff?.is_available;
    notifications = unread ?? [];
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Loop 82 (accessibility pass): a keyboard/screen-reader user
          otherwise has to tab through the whole header (logo link,
          availability toggle, notification bell, sign-out) before reaching
          any page content on every single navigation - WCAG 2.4.1 "Bypass
          Blocks". Visually hidden until focused (sr-only / focus:not-sr-only
          is the standard pattern), so sighted mouse users never see it. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <header className="chrome-blur sticky top-0 z-30 flex h-14 items-center border-b border-line px-4">
        <div className="flex w-full items-center justify-between gap-3">
          {/* Loop 86: the Boss reported no visible way back to the Module
              Hub after navigating into a section (e.g. Cases) — browser/
              device back navigation was verified working correctly (a
              round-trip Home -> Cases -> back -> Cases -> back test via
              Playwright's goBack() succeeded twice in a row), so the real
              gap was discoverability: on mobile the "MONARCH Maintenance"
              text is hidden (`hidden sm:inline`) and the plain "M" logo
              box alone doesn't read as a back control. An explicit
              chevron makes this unambiguous at every width, and this
              header only ever renders on (app) pages - never on /home
              itself, which lives outside this route group - so "back to
              Home" is always the correct destination here. */}
          <Link
            href="/home"
            aria-label="Back to Home"
            className="flex items-center gap-1.5 text-base font-semibold text-fg"
          >
            <span aria-hidden="true" className="text-lg leading-none text-muted">
              ‹
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange to-orange2 text-sm font-bold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)]">
              M
            </span>
            <span className="hidden sm:inline">MONARCH Maintenance</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-muted">
            {staffName && <span className="hidden truncate sm:inline">{staffName}</span>}
            {/* Loop 71 (§17 "Mobile Header": don't stuff availability/sign-out
                into the mobile header — they render as labeled pill/button
                controls, not icons, and now live on /more's new Account
                section instead. Staff always have /more one bottom-nav tap
                away, so nothing is lost. A non-staff user has NO bottom-nav
                at all (AppNav below is staff-only) and no /more access
                either — for them the header stays their only reachable
                surface, so these are never hidden. NotificationBell is left
                alone everywhere: it's already an icon-only control, not the
                text clutter this rule targets, and staff rely on it for
                timely escalation visibility (§7.3/§23) that burying one tap
                deeper into More would work against. */}
            {isStaff && (
              <span className="hidden sm:inline-flex">
                <AvailabilityToggle isAvailable={isAvailable} />
              </span>
            )}
            {user && <NotificationBell notifications={notifications} />}
            <span className={isStaff ? "hidden sm:inline-flex" : undefined}>
              <SignOutButton />
            </span>
          </div>
        </div>
      </header>

      <div className="flex">
        {isStaff && <AppNav />}
        {/* Loop 70 (§16): max-width grows at lg:/xl: so desktop gets the
            "more information density" the pack asks for instead of a
            mobile-width column with permanent side padding on a wide
            screen. pb-20 (bottom-nav clearance) matches AppNav's own
            lg:hidden switch — the fixed bottom bar keeps needing that
            clearance through the whole mobile+tablet range. */}
        <main
          id="main-content"
          className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-4 lg:max-w-4xl lg:pb-4 xl:max-w-5xl"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
