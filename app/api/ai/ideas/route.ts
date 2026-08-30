import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildAIContext } from "@/lib/ai/context";
import { generateIdeas } from "@/lib/ai/generate-ideas";
import { AIGenerationError } from "@/lib/ai/client";
import { logGenerationStart, logGenerationComplete, logGenerationFailed } from "@/services/ai-generation-log";
import { bulkCreateIdeas } from "@/services/content-service";
import { getWorkspace } from "@/services/workspace-service";
import { getStrategy, getPillars } from "@/services/strategy-service";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  count: z.number().int().min(1).max(20).default(6),
  focusPillarName: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { workspaceId, count, focusPillarName } = parsed.data;

  const workspace = await getWorkspace(supabase, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  let generationId: string | null = null;
  try {
    const context = await buildAIContext(supabase, workspaceId);
    generationId = await logGenerationStart(supabase, workspaceId, user.id, "ideas", { count, focusPillarName });

    const { ideas } = await generateIdeas(context, { count, focusPillarName });

    const strategy = await getStrategy(supabase, workspaceId);
    const pillars = strategy ? await getPillars(supabase, strategy.id) : [];
    const pillarByName = new Map(pillars.map((p) => [p.name.trim().toLowerCase(), p.id]));

    const saved = await bulkCreateIdeas(
      supabase,
      workspaceId,
      ideas.map((i) => ({
        title: i.title,
        description: i.description,
        content_pillar_id: i.pillar_name ? (pillarByName.get(i.pillar_name.trim().toLowerCase()) ?? null) : null,
      })),
    );

    await logGenerationComplete(supabase, generationId, { count: saved.length });

    return NextResponse.json({ ideas: saved });
  } catch (err) {
    if (generationId) {
      await logGenerationFailed(supabase, generationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
    const message = err instanceof AIGenerationError ? err.userMessage : "We couldn't generate ideas right now. Your existing ideas are safe.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
