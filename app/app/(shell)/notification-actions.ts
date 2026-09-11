"use server";

import { createClient } from "@/lib/supabase/server";
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/services/notification-service";
import type { Notification } from "@/types/database";

/**
 * Backs the notification bell in AppShell (components/layout/notification-
 * bell.tsx). Lives outside any single settings/feature folder — unlike
 * settings/actions.ts or settings/billing/actions.ts, this is used from the
 * shell layout itself, which every page under /app renders.
 */
export async function getNotificationFeedAction(): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { notifications: [], unreadCount: 0 };

  const [notifications, unreadCount] = await Promise.all([
    listNotifications(supabase, user.id, 20),
    getUnreadNotificationCount(supabase, user.id),
  ]);
  return { notifications, unreadCount };
}

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await markNotificationRead(supabase, user.id, notificationId);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await markAllNotificationsRead(supabase, user.id);
}
