import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
import { claimNotificationEvent, notifyUser } from "@/services/notification-service";
import { scheduledPostReminderEmail } from "@/lib/notifications/templates";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://constory.app";

/**
 * Scheduled daily (see vercel.json). calendar_posts.scheduled_date is a
 * plain date with no time-of-day, so "remind the day before" simply means:
 * every still-'planned' post whose scheduled_date is tomorrow (UTC).
 *
 * V1 simplification: notifies only the workspace owner, not every team
 * member — same simplification as the low-credits trigger (see
 * services/notification-service.ts). Fanning out to workspace_members is a
 * small follow-up once that's wanted.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);

  const { data: posts, error } = await admin
    .from("calendar_posts")
    .select("id, title, platform, scheduled_date, calendar_id, content_calendars(workspace_id, workspaces(id, owner_id, name))")
    .eq("status", "planned")
    .eq("scheduled_date", tomorrowDate);

  if (error) {
    console.error("[cron/post-reminders] query failed:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  let notified = 0;
  let skipped = 0;

  for (const post of posts ?? []) {
    const calendar = post.content_calendars as unknown as { workspace_id: string; workspaces: { id: string; owner_id: string; name: string } | null } | null;
    const workspace = calendar?.workspaces;
    if (!workspace) {
      skipped++;
      continue;
    }

    const claimed = await claimNotificationEvent(admin, `post_reminder:${post.id}`);
    if (!claimed) {
      skipped++;
      continue;
    }

    const { subject, html } = scheduledPostReminderEmail({
      name: "there",
      postTitle: post.title,
      platform: post.platform,
      scheduledDate: formatDate(post.scheduled_date),
      calendarUrl: `${APP_URL}/app/calendars/${post.calendar_id}`,
    });

    await notifyUser(admin, {
      userId: workspace.owner_id,
      workspaceId: workspace.id,
      type: "scheduled_post_reminder",
      title: `"${post.title}" is scheduled for tomorrow`,
      body: `${post.platform} — ${formatDate(post.scheduled_date)}. In ${workspace.name}.`,
      link: `/app/calendars/${post.calendar_id}`,
      email: { subject, html },
    });
    notified++;
  }

  return NextResponse.json({ ok: true, notified, skipped, checkedDate: tomorrowDate });
}
