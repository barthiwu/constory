import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { getBrandProfile, getProductsServices } from "@/services/brand-service";
import { OnboardingWizard, BLANK_ONBOARDING_STATE, type OnboardingState } from "@/components/onboarding/onboarding-wizard";

export const metadata: Metadata = { title: "Set up your workspace — Constory" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);

  // No workspace yet at all — start a fresh onboarding wizard from step 0.
  if (!workspace) {
    return <OnboardingWizard workspaceId={null} initialStep={0} initialState={BLANK_ONBOARDING_STATE} />;
  }

  // Already fully onboarded — nothing to resume, editing happens on /app/brand.
  if (workspace.onboarding_completed) {
    redirect("/app/dashboard");
  }

  // Resume: load whatever was already saved for this workspace so the wizard
  // starts from real, persisted data rather than a blank slate.
  const [brandProfile, products] = await Promise.all([
    getBrandProfile(supabase, workspace.id),
    getProductsServices(supabase, workspace.id),
  ]);

  const initialState: OnboardingState = {
    name: workspace.name ?? "",
    industry: workspace.industry ?? "",
    website: workspace.website ?? "",
    business_description: brandProfile?.business_description ?? "",
    products,
    target_audience: brandProfile?.target_audience ?? "",
    audience_age_range: brandProfile?.audience_age_range ?? "",
    audience_locations: brandProfile?.audience_locations ?? "",
    audience_interests: brandProfile?.audience_interests ?? "",
    audience_problems: brandProfile?.audience_problems ?? "",
    primary_goal: brandProfile?.primary_goal ?? "",
    secondary_goals: brandProfile?.secondary_goals ?? [],
    // The DB stores brand voice as a single flattened string (tags + free text
    // joined together at save time), so on resume the full saved value is shown
    // in the free-text field rather than trying to re-derive which chips were
    // originally selected.
    brand_voice_tags: [],
    brand_voice_custom: brandProfile?.brand_voice ?? "",
    selected_platforms: brandProfile?.selected_platforms ?? [],
  };

  return <OnboardingWizard workspaceId={workspace.id} initialStep={workspace.onboarding_step} initialState={initialState} />;
}
