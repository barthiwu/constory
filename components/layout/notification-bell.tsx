"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  getNotificationFeedAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/app/app/(shell)/notification-actions";
import type { Notification } from "@/types/database";

const POLL_INTERVAL_MS = 60_000;

/**
 * Bell icon + dropdown feed, rendered once in AppShell so it's on every
 * /app page. Polls rather than subscribing to realtime, deliberately — the
 * three notification types (low credits, scheduled-post reminders, weekly
 * digest) are all minutes-to-hours-scale events, not the kind of thing that
 * needs sub-second delivery, and polling keeps this component free of a
 * Supabase realtime channel to set up and tear down.
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getNotificationFeedAction();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setLoaded(true);
    } catch {
      // Best-effort — a failed poll just tries again next interval.
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount, then poll — the lint rule flags calling a
    // state-setting async function directly in an effect body, but this is
    // the "fetch on mount" pattern the rule's own guidance carves out
    // (subscribing to an external system, here polling an interval), same
    // as the localStorage read in AppShell above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) await refresh();
  }

  async function handleNotificationClick(notification: Notification) {
    if (!notification.read_at) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      markNotificationReadAction(notification.id).catch(() => {});
    }
    setOpen(false);
    if (notification.link) router.push(notification.link);
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
    await markAllNotificationsReadAction().catch(() => {});
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-text-primary">Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={handleMarkAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!loaded ? (
            <p className="px-4 py-6 text-center text-sm text-text-secondary">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-secondary">You&apos;re all caught up.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleNotificationClick(n)}
                className={cn(
                  "block w-full border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-secondary",
                  !n.read_at && "bg-blue-light/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("text-sm", !n.read_at ? "font-semibold text-text-primary" : "font-medium text-text-primary")}>
                    {n.title}
                  </span>
                  {!n.read_at && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-constory-blue" aria-hidden="true" />}
                </div>
                <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">{n.body}</p>
                <p className="mt-1 text-[11px] text-text-muted">{formatRelativeTime(n.created_at)}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
