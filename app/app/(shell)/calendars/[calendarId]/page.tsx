import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { getCalendar, getPosts } from "@/services/calendar-service";
import { getStrategy, getPillars } from "@/services/strategy-service";
import { CalendarDetailView } from "@/components/calendar/calendar-detail-view";

export async function generateMetadata({ params }: { params: Promise<{ calendarId: string }> }): Promise<Metadata> {
  const { calendarId } = await params;
  const supabase = await createClient();
  const calendar = await getCalendar(supabase, calendarId);
  return { title: calendar ? `${calendar.name} — Constory` : "Calendar — Constory" };
}

export default async function CalendarDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ calendarId: string }>;
  searchParams: Promise<{ generate?: string }>;
}) {
  const { calendarId } = await params;
  const { generate } = await searchParams;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return null;

  const calendar = await getCalendar(supabase, calendarId);
  if (!calendar || calendar.workspace_id !== workspace.id) notFound();

  const [posts, strategy] = await Promise.all([getPosts(supabase, calendarId), getStrategy(supabase, workspace.id)]);
  const pillars = strategy ? await getPillars(supabase, strategy.id) : [];

  return (
    <CalendarDetailView
      workspaceId={workspace.id}
      calendar={calendar}
      initialPosts={posts}
      pillars={pillars}
      autoGenerate={generate === "1" && posts.length === 0}
    />
  );
}
