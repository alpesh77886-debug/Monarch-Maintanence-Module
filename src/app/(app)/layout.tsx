import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import NotificationBell from "./notification-bell";
import type { AppNotification } from "@/lib/supabase/database.types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let staffName: string | null = null;
  let notifications: AppNotification[] = [];
  if (user) {
    const { data: staff } = await supabase
      .from("staff")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle();
    staffName = staff ? `${staff.full_name} (${staff.role})` : user.email ?? null;

    const { data: unread } = await supabase
      .from("notifications")
      .select("*")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    notifications = unread ?? [];
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/cases" className="text-base font-semibold text-slate-900">
            MONARCH Maintenance
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{staffName}</span>
            {user && <NotificationBell notifications={notifications} />}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
