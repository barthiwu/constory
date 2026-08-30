import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildAIContext } from "@/lib/ai/context";
import { generateStrategy } from "@/lib/ai/generate-strategy";
import { AIGenerationError } from "@/lib/ai/client";
import { logGenerationStart, logGenerationComplete, logGenerationFailed } from "@/services/ai-generation-log";
import { getWorkspace } from "@/services/workspace-service";
import { canUseAI } from "@/lib/billing/entitlements";
import { consumeAiCredits } from "@/services/billing-service";

const bodySchema = z.object({ workspaceId: z.string().uuid() });

/**
 * Generates a strategy draft only — nothing is persisted here. The client
 * shows the draft for review (edit pillars, discard, regenerate) and a
 * separate save action (createGeneratedStrategyAction in
 * app/app/(shell)/strategy/actions.ts) commits it once the user accepts.
 */
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

  const credits = await canUseAI(supabase, workspaceId, "generate_strategy");
  if (!credits.allowed) {
    return NextResponse.json({ error: credits.reason, upgradeTo: credits.upgradeTo }, { status: 402 });
  }

  let generationId: string | null = null;
  try {
    const context = await buildAIContext(supabase, workspaceId);
    generationId = await logGenerationStart(supabase, workspaceId, user.id, "strategy", {
      businessDescription: context.brand.businessDescription.slice(0, 200),
    });

    const { strategy } = await generateStrategy(context);

    if (credits.planId) await consumeAiCredits(supabase, workspaceId, "generate_strategy", credits.cost, credits.planId);

    await logGenerationComplete(supabase, generationId, {
      pillarCount: strategy.pillars.length,
      saved: false,
    });

    return NextResponse.json({ draft: strategy });
  } catch (err) {
    if (generationId) {
      await logGenerationFailed(supabase, generationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
    const message = err instanceof AIGenerationError ? err.userMessage : "We couldn't generate your strategy right now. Your existing information is safe.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
