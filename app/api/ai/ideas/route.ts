import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withinRateLimitFor } from "@/lib/rate-limit";
import { buildAIContext } from "@/lib/ai/context";
import { generateIdeas } from "@/lib/ai/generate-ideas";
import { AIGenerationError } from "@/lib/ai/client";
import { logGenerationStart, logGenerationComplete, logGenerationFailed } from "@/services/ai-generation-log";
import { getWorkspace } from "@/services/workspace-service";
import { getStrategy, getPillars } from "@/services/strategy-service";
import { canUseAI } from "@/lib/billing/entitlements";
import { reserveAiCredits, settleAiCredits, refundAiCredits } from "@/lib/billing/ai-credits";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  count: z.number().int().min(1).max(20).default(6),
  // Free-text values are interpolated into the model prompt (and cost tokens) -- cap their size.
  focusPillarName: z.string().max(200).optional(),
  platform: z.string().max(100).optional(),
  objective: z.string().max(200).optional(),
  format: z.string().max(100).optional(),
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

  // Per-user burst limit. Credits are only consumed AFTER a successful generation, so without this a
  // client could fire many parallel requests while it still has credit left (check-then-act race)
  // and get several paid OpenAI generations for the price of one.
  if (!(await withinRateLimitFor(`ai:user:${user.id}`, 20, 60))) {
    return NextResponse.json({ error: "You're generating too quickly. Please wait a moment and try again." }, { status: 429 });
  }

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

  // Hold the credits NOW, before any AI work (migration 0028). canUseAI above is only a cheap pre-check with
  // friendly messages; this atomic reservation is what actually stops parallel requests from all passing the
  // check and each running a paid generation, and it is also where a read-only member is refused.
  const held = await reserveAiCredits(supabase, workspaceId, "generate_ideas", credits.cost, credits.planId);
  if (!held.ok) {
    return NextResponse.json({ error: held.error, upgradeTo: held.upgradeTo }, { status: held.status });
  }
  const reservation = held.reservation;

  let generationId: string | null = null;
  try {
    const context = await buildAIContext(supabase, workspaceId);
    generationId = await logGenerationStart(supabase, workspaceId, user.id, "ideas", { count, focusPillarName, platform, objective, format });

    const { ideas } = await generateIdeas(context, { count, focusPillarName, platform, objective, format });

        await settleAiCredits(reservation);

    const strategy = await getStrategy(supabase, workspaceId);
    const pillars = strategy ? await getPillars(supabase, strategy.id) : [];
    const pillarByName = new Map(pillars.map((p) => [p.name.trim().toLowerCase(), p.id]));

    const draft = ideas.map((i) => ({
      title: i.title,
      description: i.description,
      pillar_name: i.pillar_name,
      content_pillar_id: i.pillar_name ? (pillarByName.get(i.pillar_name.trim().toLowerCase()) ?? null) : null,
      recommended_platforms: i.recommended_platforms,
      recommended_format: i.recommended_format,
      content_objective: i.content_objective,
      suggested_hook: i.suggested_hook,
    }));

    await logGenerationComplete(supabase, generationId, { count: draft.length, saved: false });

    return NextResponse.json({ ideas: draft });
  } catch (err) {
    // Nothing was delivered, so give the held credits back (a no-op if they were already settled).
    await refundAiCredits(reservation);
    if (generationId) {
      await logGenerationFailed(supabase, generationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
    const message = err instanceof AIGenerationError ? err.userMessage : "We couldn't generate ideas right now. Your existing ideas are safe.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
