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
      <header className="chrome-blur sticky top-0 z-30 flex h-14 items-center border-b border-line px-4">
        <div className="flex w-full items-center justify-between gap-3">
          <Link href="/home" className="flex items-center gap-2 text-base font-semibold text-fg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange to-orange2 text-sm font-bold text-white shadow-[0_2px_8px_rgba(249,115,22,0.3)]">
              M
            </span>
            <span className="hidden sm:inline">MONARCH Maintenance</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-muted">
            {staffName && <span className="hidden truncate sm:inline">{staffName}</span>}
            {isStaff && <AvailabilityToggle isAvailable={isAvailable} />}
            {user && <NotificationBell notifications={notifications} />}
            <SignOutButton />
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
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-4 lg:max-w-4xl lg:pb-4 xl:max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  );
}
