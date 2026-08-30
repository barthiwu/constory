import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildAIContext } from "@/lib/ai/context";
import { generateCalendarContent } from "@/lib/ai/generate-calendar";
import { AIGenerationError } from "@/lib/ai/client";
import { logGenerationStart, logGenerationComplete, logGenerationFailed } from "@/services/ai-generation-log";
import { getCalendar, bulkCreatePosts, getPosts } from "@/services/calendar-service";
import { getStrategy, getPillars } from "@/services/strategy-service";
import { getWorkspace } from "@/services/workspace-service";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  calendarId: z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { workspaceId, calendarId } = parsed.data;

  const [workspace, calendar] = await Promise.all([getWorkspace(supabase, workspaceId), getCalendar(supabase, calendarId)]);
  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (!calendar || calendar.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Calendar not found." }, { status: 404 });
  }

  const existingPosts = await getPosts(supabase, calendarId);
  if (existingPosts.length > 0) {
    return NextResponse.json(
      { error: "This calendar already has content. Generating again would duplicate it — delete existing posts first if you want to start over." },
      { status: 409 },
    );
  }

  let generationId: string | null = null;
  try {
    const strategy = await getStrategy(supabase, workspaceId);
    if (!strategy) {
      return NextResponse.json(
        { error: "Generate a content strategy for this workspace before generating a calendar." },
        { status: 422 },
      );
    }
    const pillars = await getPillars(supabase, strategy.id);

    const context = await buildAIContext(supabase, workspaceId);
    generationId = await logGenerationStart(supabase, workspaceId, user.id, "calendar", {
      calendarId,
      startDate: calendar.start_date,
      endDate: calendar.end_date,
      postingFrequency: calendar.posting_frequency,
    });

    const result = await generateCalendarContent(context, calendar, pillars);

    const created = await bulkCreatePosts(supabase, calendarId, result.posts);

    await logGenerationComplete(supabase, generationId, {
      postCount: created.length,
      distribution: result.distribution,
    });

    return NextResponse.json({ postCount: created.length, distribution: result.distribution });
  } catch (err) {
    if (generationId) {
      await logGenerationFailed(supabase, generationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
    const message =
      err instanceof AIGenerationError
        ? err.userMessage
        : "We couldn't generate your calendar right now. Your existing information is safe. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
