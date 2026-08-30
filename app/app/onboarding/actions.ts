"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createWorkspace,
  updateWorkspace,
  getWorkspaceMembership,
  setOnboardingStep,
  completeOnboardingWorkspace,
} from "@/services/workspace-service";
import { upsertBrandProfile, type UpsertBrandProfileInput } from "@/services/brand-service";

export interface OnboardingWorkspaceInput {
  name: string;
  industry?: string;
  website?: string;
}

/**
 * Step 0 (workspace basics). Creates a new workspace on first use, or updates
 * the existing draft when the user is resuming. Resuming requires the caller to
 * actually be a member of the workspace they claim to be resuming — this is an
 * explicit app-level check, not something left to RLS alone, since a client
 * could otherwise pass back an arbitrary workspace id.
 */
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
    let workspaceId: string;

    if (existingWorkspaceId) {
      const role = await getWorkspaceMembership(supabase, user.id, existingWorkspaceId);
      if (!role) return { error: "You don't have access to that workspace." };

      await updateWorkspace(supabase, existingWorkspaceId, {
        name: input.name,
        industry: input.industry || null,
        website: input.website || null,
      });
      workspaceId = existingWorkspaceId;
    } else {
      const workspace = await createWorkspace(supabase, user.id, {
        name: input.name,
        industry: input.industry || null,
        website: input.website || null,
      });
      workspaceId = workspace.id;
    }

    await setOnboardingStep(supabase, workspaceId, 1);
    return { workspaceId };
  } catch {
    return { error: "We couldn't save your workspace. Please try again." };
  }
}

/**
 * Persists one onboarding step's brand-profile fields (if any) and advances the
 * saved resume point. Called after every step, not just at the very end, so
 * progress survives a refresh, logout, or the browser closing mid-flow.
 */
export async function saveOnboardingProgressAction(
  workspaceId: string,
  nextStep: number,
  patch: UpsertBrandProfileInput,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const role = await getWorkspaceMembership(supabase, user.id, workspaceId);
  if (!role) return { error: "You don't have access to that workspace." };

  try {
    if (Object.keys(patch).length > 0) {
      await upsertBrandProfile(supabase, workspaceId, patch);
    }
    await setOnboardingStep(supabase, workspaceId, nextStep);
    return { ok: true };
  } catch {
    return { error: "We couldn't save your progress. Please try again." };
  }
}

/**
 * Final step: marks onboarding complete. All brand-profile fields and products
 * were already persisted incrementally by earlier steps, so there is nothing
 * left to save here beyond flipping the completion flag.
 */
export async function finishOnboardingAction(workspaceId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const role = await getWorkspaceMembership(supabase, user.id, workspaceId);
  if (!role) return { error: "You don't have access to that workspace." };

  try {
    await completeOnboardingWorkspace(supabase, workspaceId);
    return { ok: true };
  } catch {
    return { error: "We couldn't finish onboarding. Please try again." };
  }
}
