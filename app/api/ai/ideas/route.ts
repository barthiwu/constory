import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildAIContext } from "@/lib/ai/context";
import { generateIdeas } from "@/lib/ai/generate-ideas";
import { AIGenerationError } from "@/lib/ai/client";
import { logGenerationStart, logGenerationComplete, logGenerationFailed } from "@/services/ai-generation-log";
import { getWorkspace } from "@/services/workspace-service";
import { getStrategy, getPillars } from "@/services/strategy-service";
import { canUseAI } from "@/lib/billing/entitlements";
import { consumeAiCredits } from "@/services/billing-service";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  count: z.number().int().min(1).max(20).default(6),
  focusPillarName: z.string().optional(),
  platform: z.string().optional(),
  objective: z.string().optional(),
  format: z.string().optional(),
});

/**
 * Generates idea drafts only — nothing is persisted here. The client shows
 * them for review (select which to keep, edit, discard, regenerate) and a
 * separate save action (saveGeneratedIdeasAction in
 * app/app/(shell)/ideas/actions.ts) commits the ones the user selects.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { workspaceId, count, focusPillarName, platform, objective, format } = parsed.data;

  const workspace = await getWorkspace(supabase, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  // Verify entitlement + available credits BEFORE calling the AI provider —
  // never spend the cost of an OpenAI call just to reject the result (spec §33).
  const credits = await canUseAI(supabase, workspaceId, "generate_ideas");
  if (!credits.allowed) {
    return NextResponse.json({ error: credits.reason, upgradeTo: credits.upgradeTo }, { status: 402 });
  }

  let generationId: string | null = null;
  try {
    const context = await buildAIContext(supabase, workspaceId);
    generationId = await logGenerationStart(supabase, workspaceId, user.id, "ideas", { count, focusPillarName, platform, objective, format });

    const { ideas } = await generateIdeas(context, { count, focusPillarName, platform, objective, format });

    // Only ever consume credits once the AI call has actually succeeded
    // (spec §8) — a failed generation below never reaches this line.
    if (credits.planId) await consumeAiCredits(supabase, workspaceId, "generate_ideas", credits.cost, credits.planId);

    const strategy = await getStrategy(supabase, workspaceId);
    const pillars = strategy ? await getPillars(supabase, strategy.id) : [];
    const pillarByName = new Map(pillars.map((p) => [p.name.trim().toLowerCase(), p.id]));

    const draft = ideas.map((i) => ({
      title: i.title,
      description: i.description,
      pillar_name: i.pillar_name,
      content_pillar_id: i.pillar_name ? (pillarByName.get(i.pillar_name.trim().toLowerCase()) ?? null) : null,
      recommended_platform: i.recommended_platform,
      recommended_format: i.recommended_format,
      content_objective: i.content_objective,
      suggested_hook: i.suggested_hook,
    }));

    await logGenerationComplete(supabase, generationId, { count: draft.length, saved: false });

    return NextResponse.json({ ideas: draft });
  } catch (err) {
    if (generationId) {
      await logGenerationFailed(supabase, generationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
    const message = err instanceof AIGenerationError ? err.userMessage : "We couldn't generate ideas right now. Your existing ideas are safe.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
