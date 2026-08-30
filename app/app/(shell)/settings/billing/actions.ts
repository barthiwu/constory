"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getBillingProvider } from "@/lib/billing/provider";
import { setActiveWorkspaces, getResolvedSubscription } from "@/services/billing-service";
import { getPlanEntitlements } from "@/lib/billing/plans";
import type { PlanId, BillingInterval } from "@/types/database";

export interface ActionResult {
  error?: string;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Switches the caller's own plan/billing interval. Goes through the
 * BillingProvider boundary (lib/billing/provider.ts) rather than writing to
 * `subscriptions` directly — see that file for why this doesn't collect real
 * payment yet, and PHASE7_5_COMPLETION_REPORT.md section H.
 */
export async function changePlanAction(
  planId: PlanId,
  billingInterval: BillingInterval,
): Promise<ActionResult & { message?: string; redirectUrl?: string }> {
  const { supabase, user } = await requireUser();
  if (!user?.email) return { error: "Not authenticated." };

  try {
    const result = await getBillingProvider().createCheckout(supabase, user.id, user.email, planId, billingInterval);
    revalidatePath("/app/settings/billing");
    revalidatePath("/app", "layout");
    return { message: result.message, redirectUrl: result.redirectUrl };
  } catch {
    return { error: "We couldn't change your plan. Please try again." };
  }
}

export async function cancelSubscriptionAction(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await getBillingProvider().cancelSubscription(supabase, user.id);
    revalidatePath("/app/settings/billing");
    return {};
  } catch {
    return { error: "We couldn't cancel your subscription. Please try again." };
  }
}

export async function resumeSubscriptionAction(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await getBillingProvider().resumeSubscription(supabase, user.id);
    revalidatePath("/app/settings/billing");
    return {};
  } catch {
    return { error: "We couldn't resume your subscription. Please try again." };
  }
}

/** Downgrade grace handling (spec §28): the owner picks which brands stay active. */
export async function setActiveWorkspacesAction(workspaceIds: string[]): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  try {
    const sub = await getResolvedSubscription(supabase, user.id);
    const limit = getPlanEntitlements(sub?.plan_id ?? "free").brands;
    // Admin client for the actual billing_locked writes — see migration
    // 0010 / PHASE7_5_AUDIT_REPORT.md Security Findings §1. `user.id` is
    // the server-verified session owner, not client input.
    const result = await setActiveWorkspaces(createAdminClient(), user.id, workspaceIds, limit);
    if (!result.ok) return { error: result.error };
    revalidatePath("/app/settings/billing");
    revalidatePath("/app", "layout");
    return {};
  } catch {
    return { error: "We couldn't update your active brands. Please try again." };
  }
}
