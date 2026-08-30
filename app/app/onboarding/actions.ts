"use server";

import { createClient } from "@/lib/supabase/server";
import { createWorkspace, updateWorkspace } from "@/services/workspace-service";
import { upsertBrandProfile, createProductService } from "@/services/brand-service";

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

  // Onboarding's job in this phase is only to persist the brand profile.
  // Strategy generation is a separate, explicit action the user takes later
  // from the Strategy page — it is never triggered automatically here, so
  // this flow never depends on OPENAI_API_KEY being configured.
  return { ok: true, strategyGenerated: false };
}
