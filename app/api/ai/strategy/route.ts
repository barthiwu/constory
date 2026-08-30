import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildAIContext } from "@/lib/ai/context";
import { generateStrategy } from "@/lib/ai/generate-strategy";
import { AIGenerationError } from "@/lib/ai/client";
import { logGenerationStart, logGenerationComplete, logGenerationFailed } from "@/services/ai-generation-log";
import { saveStrategy } from "@/services/strategy-service";
import { getWorkspace } from "@/services/workspace-service";

const bodySchema = z.object({ workspaceId: z.string().uuid() });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { workspaceId } = parsed.data;

  const workspace = await getWorkspace(supabase, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  let generationId: string | null = null;
  try {
    const context = await buildAIContext(supabase, workspaceId);
    generationId = await logGenerationStart(supabase, workspaceId, user.id, "strategy", {
      businessDescription: context.brand.businessDescription.slice(0, 200),
    });

    const { strategy } = await generateStrategy(context);

    const saved = await saveStrategy(supabase, workspaceId, {
      strategy_summary: strategy.strategy_summary,
      monthly_theme: strategy.monthly_theme,
      content_mix: strategy.pillars.map((p) => ({ pillar: p.name, percentage: p.recommended_percentage })),
      source: "AI",
      pillars: strategy.pillars.map((p) => ({
        name: p.name,
        description: p.description,
        recommended_percentage: p.recommended_percentage,
        source: "AI" as const,
      })),
    });

    await logGenerationComplete(supabase, generationId, { strategyId: saved.id, pillarCount: strategy.pillars.length });

    return NextResponse.json({ strategyId: saved.id });
  } catch (err) {
    if (generationId) {
      await logGenerationFailed(supabase, generationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
    const message = err instanceof AIGenerationError ? err.userMessage : "We couldn't generate your strategy right now. Your existing information is safe.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
