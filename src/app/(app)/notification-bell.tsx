"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/supabase/database.types";

// §23: notifications are event-driven, not spam-driven — this is a plain
// unread list, not a live/push feed. Read state is set only via
// mark_notification_read (RPC-only; see 0008 migration), never a direct
// client update.
export default function NotificationBell({
  notifications,
}: {
  notifications: AppNotification[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function markRead(id: string) {
    setBusyId(id);
    const supabase = createClient();
    await supabase.rpc("mark_notification_read", { p_notification_id: id });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
      >
        Notifications
        {notifications.length > 0 && (
          <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            {notifications.length}
          </span>
        )}
      </button>
      {open && (
        <div
          data-testid="notification-panel"
          className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
        >
          {notifications.length === 0 && (
            <p className="p-2 text-sm text-slate-500">No unread notifications.</p>
          )}
          <ul className="flex flex-col gap-1">
            {notifications.map((n) => (
              <li key={n.id} className="rounded-md border border-slate-100 p-2 text-sm">
                <p className="text-slate-800">{n.message}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                  <div className="flex gap-2">
                    {n.case_id && (
                      <Link
                        href={`/cases/${n.case_id}`}
                        onClick={() => setOpen(false)}
                        className="text-xs font-medium text-blue-700"
                      >
                        View case
                      </Link>
                    )}
                    <button
                      onClick={() => markRead(n.id)}
                      disabled={busyId === n.id}
                      className="text-xs font-medium text-slate-500 disabled:opacity-50"
                    >
                      Mark read
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
