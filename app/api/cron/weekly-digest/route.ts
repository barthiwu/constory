import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";
import { claimNotificationEvent, notifyUser } from "@/services/notification-service";
import { weeklyDigestEmail } from "@/lib/notifications/templates";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://constory.app";

function isoWeekKey(d: Date): string {
  // Good enough for a once-a-week idempotency key — doesn't need to be a
  // spec-correct ISO week number, just stable and unique per calendar week.
  const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

/**
 * Scheduled weekly (see vercel.json), one digest per workspace. V1
 * simplification: sent only to the workspace owner, not every team member
 * — see the same note on app/api/cron/post-reminders/route.ts.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const weekKey = isoWeekKey(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const sevenDaysAgoDate = sevenDaysAgo.toISOString().slice(0, 10);
  const todayDate = now.toISOString().slice(0, 10);
  const sevenDaysAheadDate = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const { data: workspaces, error } = await admin.from("workspaces").select("id, owner_id, name");
  if (error) {
    console.error("[cron/weekly-digest] workspace query failed:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const workspace of workspaces ?? []) {
    const claimed = await claimNotificationEvent(admin, `weekly_digest:${workspace.id}:${weekKey}`);
    if (!claimed) {
      skipped++;
      continue;
    }

    const [{ count: completedCount }, { count: scheduledCount }, { count: ideasCount }, { data: usageRows }] = await Promise.all([
      admin
        .from("calendar_posts")
        .select("id, content_calendars!inner(workspace_id)", { count: "exact", head: true })
        .eq("content_calendars.workspace_id", workspace.id)
        .eq("status", "completed")
        .gte("scheduled_date", sevenDaysAgoDate)
        .lte("scheduled_date", todayDate),
      admin
        .from("calendar_posts")
        .select("id, content_calendars!inner(workspace_id)", { count: "exact", head: true })
        .eq("content_calendars.workspace_id", workspace.id)
        .eq("status", "planned")
        .gte("scheduled_date", todayDate)
        .lte("scheduled_date", sevenDaysAheadDate),
      admin.from("content_ideas").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "active"),
      admin
        .from("ai_usage_ledger")
        .select("credits_used")
        .eq("workspace_id", workspace.id)
        .eq("request_status", "success")
        .gte("created_at", sevenDaysAgo.toISOString()),
    ]);

    // Skip workspaces with no activity at all this week rather than sending
    // an empty-feeling "0 / 0 / 0 / 0" email every Monday.
    const creditsUsed = (usageRows ?? []).reduce((sum, r) => sum + (r.credits_used ?? 0), 0);
    if (!completedCount && !scheduledCount && !ideasCount && !creditsUsed) {
      skipped++;
      continue;
    }

    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", workspace.owner_id).maybeSingle();
    const name = profile?.full_name?.split(" ")[0] || "there";

    const { subject, html } = weeklyDigestEmail({
      name,
      workspaceName: workspace.name,
      postsPublishedLastWeek: completedCount ?? 0,
      postsScheduledThisWeek: scheduledCount ?? 0,
      creditsUsedLastWeek: creditsUsed,
      ideasReady: ideasCount ?? 0,
      dashboardUrl: `${APP_URL}/app/dashboard`,
    });

    await notifyUser(admin, {
      userId: workspace.owner_id,
      workspaceId: workspace.id,
      type: "weekly_digest",
      title: `Your weekly digest — ${workspace.name}`,
      body: `${completedCount ?? 0} posts completed, ${scheduledCount ?? 0} scheduled this week, ${creditsUsed} credits used.`,
      link: "/app/dashboard",
      email: { subject, html },
    });
    sent++;
  }

  return NextResponse.json({ ok: true, sent, skipped, weekKey });
}
