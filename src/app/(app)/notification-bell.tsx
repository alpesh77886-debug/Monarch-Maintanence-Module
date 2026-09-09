"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/supabase/database.types";
import { Button } from "@/components/ui";

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
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="notification-panel"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-bg2"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.7}>
          <path
            d="M6 10a6 6 0 1 1 12 0c0 3.5 1 5 1.5 5.5H4.5C5 15 6 13.5 6 10Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 18a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">
            {notifications.length}
          </span>
        )}
      </button>
      {open && (
        <div
          id="notification-panel"
          data-testid="notification-panel"
          className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-line bg-card p-2 shadow-lg"
        >
          {notifications.length === 0 && (
            <p className="p-2 text-sm text-muted">No unread notifications.</p>
          )}
          <ul className="flex flex-col gap-1">
            {notifications.map((n) => (
              <li key={n.id} className="rounded-lg border border-line bg-bg2 p-2 text-sm">
                <p className="text-fg">{n.message}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-xs text-muted2">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2">
                    {n.case_id && (
                      <Link
                        href={`/cases/${n.case_id}`}
                        onClick={() => setOpen(false)}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        View case
                      </Link>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-1.5 py-0.5"
                      onClick={() => markRead(n.id)}
                      disabled={busyId === n.id}
                    >
                      Mark read
                    </Button>
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
