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
    const { data: staff } = await supabase
      .from("staff")
      .select("full_name, role, is_available")
      .eq("id", user.id)
      .maybeSingle();
    staffName = staff ? `${staff.full_name} (${staff.role})` : user.email ?? null;
    isStaff = !!staff;
    isAvailable = !!staff?.is_available;

    const { data: unread } = await supabase
      .from("notifications")
      .select("*")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    notifications = unread ?? [];
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-slate-200 bg-white px-4">
        <div className="flex w-full items-center justify-between gap-3">
          <Link href="/cases" className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              M
            </span>
            <span className="hidden sm:inline">MONARCH Maintenance</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            {staffName && <span className="hidden truncate sm:inline">{staffName}</span>}
            {isStaff && <AvailabilityToggle isAvailable={isAvailable} />}
            {user && <NotificationBell notifications={notifications} />}
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="flex">
        {isStaff && <AppNav />}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-4 md:pb-4">{children}</main>
      </div>
    </div>
  );
}
