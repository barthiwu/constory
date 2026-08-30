import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildAIContext } from "@/lib/ai/context";
import { regenerateTopic, regenerateCaption, generateAlternativeAngle, improveField, regenerateField } from "@/lib/ai/regenerate";
import { AIGenerationError } from "@/lib/ai/client";
import { logGenerationStart, logGenerationComplete, logGenerationFailed } from "@/services/ai-generation-log";
import { getPost, updatePost, getCalendar } from "@/services/calendar-service";
import type { CreatePostInput } from "@/services/calendar-service";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("topic"), postId: z.string().uuid() }),
  z.object({ action: z.literal("alternative_angle"), postId: z.string().uuid() }),
  z.object({ action: z.literal("caption"), postId: z.string().uuid() }),
  z.object({
    action: z.literal("improve"),
    postId: z.string().uuid(),
    field: z.enum(["caption", "hook", "cta", "creative_direction"]),
    option: z.enum([
      "more_professional",
      "more_conversational",
      "more_engaging",
      "shorter",
      "longer",
      "more_educational",
      "more_promotional",
    ]),
  }),
  z.object({
    action: z.literal("field"),
    postId: z.string().uuid(),
    field: z.enum(["hook", "cta", "creative_direction"]),
  }),
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const body = parsed.data;

  const post = await getPost(supabase, body.postId);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const calendar = await getCalendar(supabase, post.calendar_id);
  if (!calendar) return NextResponse.json({ error: "Calendar not found." }, { status: 404 });

  let generationId: string | null = null;
  try {
    const context = await buildAIContext(supabase, calendar.workspace_id);
    generationId = await logGenerationStart(supabase, calendar.workspace_id, user.id, "regeneration", {
      postId: post.id,
      action: body.action,
    });

    let update: Partial<CreatePostInput> = {};
    let output: Record<string, unknown> = {};

    if (body.action === "topic") {
      const result = await regenerateTopic(context, post);
      update = { title: result.title, brief: result.brief, hook: result.hook };
      output = result;
    } else if (body.action === "alternative_angle") {
      const result = await generateAlternativeAngle(context, post);
      update = { title: result.title, brief: result.brief, hook: result.hook };
      output = result;
    } else if (body.action === "caption") {
      const result = await regenerateCaption(context, post);
      update = { caption: result.caption, cta: result.cta, hashtags: result.hashtags };
      output = result;
    } else if (body.action === "improve") {
      const value = await improveField(context, post, body.field, body.option);
      update = { [body.field]: value } as Partial<CreatePostInput>;
      output = { field: body.field, option: body.option };
    } else if (body.action === "field") {
      const value = await regenerateField(context, post, body.field);
      update = { [body.field]: value } as Partial<CreatePostInput>;
      output = { field: body.field };
    }

    const updated = await updatePost(supabase, post.id, update);
    await logGenerationComplete(supabase, generationId, output);

    return NextResponse.json({ post: updated });
  } catch (err) {
    if (generationId) {
      await logGenerationFailed(supabase, generationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
    const message =
      err instanceof AIGenerationError ? err.userMessage : "We couldn't regenerate this content right now. The current content is unchanged.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
