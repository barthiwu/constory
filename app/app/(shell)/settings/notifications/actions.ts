"use server";

import { createClient } from "@/lib/supabase/server";
import { updateNotificationPreferences } from "@/services/notification-service";
import type { NotificationPreferences } from "@/types/database";

export interface ActionResult {
  error?: string;
}

type PreferenceKey = keyof Omit<NotificationPreferences, "user_id" | "created_at" | "updated_at">;

export async function updateNotificationPreferenceAction(key: PreferenceKey, value: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await updateNotificationPreferences(supabase, user.id, { [key]: value });
    return {};
  } catch {
    return { error: "We couldn't save that preference. Please try again." };
  }
}
