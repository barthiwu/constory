import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Notification, NotificationPreferences, NotificationType } from "@/types/database";
import { sendEmail } from "@/lib/notifications/email";
import { lowCreditsEmail } from "@/lib/notifications/templates";

type DB = SupabaseClient<Database>;

const DEFAULT_PREFERENCES: Omit<NotificationPreferences, "user_id" | "created_at" | "updated_at"> = {
  email_low_credits: true,
  email_scheduled_posts: true,
  email_weekly_digest: true,
  inapp_low_credits: true,
  inapp_scheduled_posts: true,
  inapp_weekly_digest: true,
};

const CATEGORY_BY_TYPE: Record<NotificationType, "low_credits" | "scheduled_posts" | "weekly_digest"> = {
  low_credits: "low_credits",
  scheduled_post_reminder: "scheduled_posts",
  weekly_digest: "weekly_digest",
};

/** Reads the caller's own preferences (RLS-scoped), falling back to defaults for a row that doesn't exist yet. */
export async function getNotificationPreferences(supabase: DB, userId: string): Promise<NotificationPreferences> {
  const { data, error } = await supabase.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) return data;
  return { user_id: userId, ...DEFAULT_PREFERENCES, created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString() };
}

/** Upserts the caller's own preferences (RLS-scoped — call with the user's session client, not admin). */
export async function updateNotificationPreferences(
  supabase: DB,
  userId: string,
  patch: Partial<Omit<NotificationPreferences, "user_id" | "created_at" | "updated_at">>,
): Promise<void> {
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

/** The signed-in user's most recent notifications, newest first. */
export async function listNotifications(supabase: DB, userId: string, limit = 20): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getUnreadNotificationCount(supabase: DB, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(supabase: DB, userId: string, notificationId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function markAllNotificationsRead(supabase: DB, userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

/**
 * Claims a one-time notification event via notification_log's unique
 * `event_key`. Returns true the first time a given key is claimed (the
 * caller should proceed and send/insert), false on every subsequent call
 * (already handled — mirrors the billing_events idempotency pattern in
 * lib/billing so a cron route that overlaps or retries never double-sends).
 * `admin` only — notification_log has no RLS policies for `authenticated`.
 */
export async function claimNotificationEvent(admin: DB, eventKey: string): Promise<boolean> {
  const { error } = await admin.from("notification_log").insert({ event_key: eventKey });
  if (!error) return true;
  // 23505 = unique_violation — already claimed, not a real error.
  if ((error as { code?: string }).code === "23505") return false;
  throw error;
}

export interface NotifyInput {
  userId: string;
  workspaceId?: string | null;
  type: NotificationType;
  /** In-app feed copy. */
  title: string;
  body: string;
  link?: string | null;
  /** Email copy — omit to only ever create the in-app row, never an email, regardless of preference. */
  email?: { subject: string; html: string };
}

/**
 * The single entry point every trigger (credit spend, the reminder cron, the
 * digest cron) should call. Reads the recipient's preferences, creates the
 * in-app notification row if that channel is on, and sends the email if
 * that channel is on and `email` was provided. Always uses the admin client
 * — notifications are system-generated, never something a user session
 * inserts for itself.
 */
export async function notifyUser(admin: DB, input: NotifyInput): Promise<void> {
  const category = CATEGORY_BY_TYPE[input.type];
  const prefs = await getNotificationPreferences(admin, input.userId);

  const inAppEnabled = prefs[`inapp_${category}` as const];
  const emailEnabled = prefs[`email_${category}` as const];

  if (inAppEnabled) {
    const { error } = await admin.from("notifications").insert({
      user_id: input.userId,
      workspace_id: input.workspaceId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
    });
    if (error) throw error;
  }

  if (emailEnabled && input.email) {
    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(input.userId);
    const email = userError ? null : userResult?.user?.email;
    if (email) {
      await sendEmail({ to: email, subject: input.email.subject, html: input.email.html });
    }
  }
}


/**
 * Fires the "low AI credits" notification the first time a consumeAiCredits
 * call leaves the account at or below 20% of its monthly allocation (or, at
 * small allocations, its last credit). Idempotent via notification_log —
 * the event key includes the credit period's end date, so it fires at most
 * once per period and a fresh period gets its own notice. Best-effort:
 * every failure is caught and logged, never thrown — a notification must
 * never fail the AI generation request that triggered it.
 */
export async function notifyLowCreditsIfNeeded(admin: DB, ownerId: string, remaining: number, allocation: number): Promise<void> {
  if (allocation <= 0 || remaining < 0) return;
  const threshold = Math.max(1, Math.ceil(allocation * 0.2));
  if (remaining > threshold) return;

  try {
    const { data: balance } = await admin.from("credit_balances").select("period_end").eq("owner_id", ownerId).maybeSingle();
    const periodEnd = balance?.period_end ?? "unknown";
    const claimed = await claimNotificationEvent(admin, `low_credits:${ownerId}:${periodEnd}`);
    if (!claimed) return;

    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", ownerId).maybeSingle();
    const name = profile?.full_name?.split(" ")[0] || "there";
    const { subject, html } = lowCreditsEmail({ name, remaining, allowance: allocation });

    await notifyUser(admin, {
      userId: ownerId,
      type: "low_credits",
      title: "Running low on AI credits",
      body: `You have ${remaining} of ${allocation} AI credits left this period.`,
      link: "/app/settings/billing",
      email: { subject, html },
    });
  } catch (err) {
    console.error("[notifications] notifyLowCreditsIfNeeded failed:", err);
  }
}
