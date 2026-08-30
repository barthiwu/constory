"use server";

import { createClient } from "@/lib/supabase/server";
import { createWorkspace, updateWorkspace } from "@/services/workspace-service";
import { upsertBrandProfile, createProductService } from "@/services/brand-service";
import { saveStrategy } from "@/services/strategy-service";
import { buildAIContext } from "@/lib/ai/context";
import { generateStrategy } from "@/lib/ai/generate-strategy";
import { AIGenerationError } from "@/lib/ai/client";
import { logGenerationStart, logGenerationComplete, logGenerationFailed } from "@/services/ai-generation-log";

export interface OnboardingWorkspaceInput {
  name: string;
  industry?: string;
  website?: string;
}

export async function startOnboardingAction(
  input: OnboardingWorkspaceInput,
  existingWorkspaceId?: string,
): Promise<{ workspaceId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    if (existingWorkspaceId) {
      await updateWorkspace(supabase, existingWorkspaceId, {
        name: input.name,
        industry: input.industry || null,
        website: input.website || null,
      });
      return { workspaceId: existingWorkspaceId };
    }
    const workspace = await createWorkspace(supabase, user.id, {
      name: input.name,
      industry: input.industry || null,
      website: input.website || null,
    });
    return { workspaceId: workspace.id };
  } catch {
    return { error: "We couldn't save your workspace. Please try again." };
  }
}

export interface OnboardingCompletionInput {
  business_description: string;
  products: Array<{ name: string; description: string; category?: string }>;
  target_audience: string;
  audience_age_range?: string;
  audience_locations?: string;
  audience_interests?: string;
  audience_problems?: string;
  primary_goal: string;
  secondary_goals: string[];
  brand_voice: string;
  selected_platforms: string[];
}

export interface OnboardingCompletionResult {
  ok: boolean;
  strategyGenerated: boolean;
  error?: string;
}

export async function completeOnboardingAction(
  workspaceId: string,
  input: OnboardingCompletionInput,
): Promise<OnboardingCompletionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, strategyGenerated: false, error: "Not authenticated." };

  try {
    await upsertBrandProfile(supabase, workspaceId, {
      business_description: input.business_description,
      target_audience: input.target_audience,
      audience_age_range: input.audience_age_range || null,
      audience_locations: input.audience_locations || null,
      audience_interests: input.audience_interests || null,
      audience_problems: input.audience_problems || null,
      brand_voice: input.brand_voice,
      primary_goal: input.primary_goal,
      secondary_goals: input.secondary_goals,
      selected_platforms: input.selected_platforms,
    });

    for (const product of input.products) {
      if (!product.name.trim()) continue;
      await createProductService(supabase, workspaceId, {
        name: product.name,
        description: product.description,
        category: product.category || null,
      });
    }
  } catch {
    return { ok: false, strategyGenerated: false, error: "We couldn't save your brand information. Please try again." };
  }

  // Brand data is safely saved at this point regardless of what happens next —
  // strategy generation failing here should never be reported as onboarding failing.
  let generationId: string | null = null;
  try {
    const context = await buildAIContext(supabase, workspaceId);
    generationId = await logGenerationStart(supabase, workspaceId, user.id, "strategy", { onboarding: true });
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
    await logGenerationComplete(supabase, generationId, { strategyId: saved.id });
    return { ok: true, strategyGenerated: true };
  } catch (err) {
    if (generationId) {
      await logGenerationFailed(supabase, generationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
    const message = err instanceof AIGenerationError ? err.userMessage : "We couldn't generate your strategy automatically.";
    return { ok: true, strategyGenerated: false, error: message };
  }
}
