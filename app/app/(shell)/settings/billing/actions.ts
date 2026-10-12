"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getBillingProvider } from "@/lib/billing/provider";
import { setActiveWorkspaces, getResolvedSubscription, PrepaidPlanError } from "@/services/billing-service";
import { getPlanEntitlements, getPlan, isUpgrade } from "@/lib/billing/plans";
import type { PlanId, BillingInterval } from "@/types/database";
import type { PaymentMethod } from "@/lib/billing/provider";
import { transferAmountFor } from "@/lib/billing/payment-expectations";

export interface ActionResult {
  error?: string;
}

const planSelectionSchema = z.object({
  planId: z.enum(["free", "creator", "pro"]),
  billingInterval: z.enum(["monthly", "quarterly", "annual"]),
  method: z.enum(["card", "bank_transfer"]),
});

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "the end of the current period";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  method: PaymentMethod = "card",
  /** For bank transfer: the amount (minor units) the customer was shown. Refused if the price changed since. */
  quotedAmountMinor?: number,
): Promise<ActionResult & { message?: string; redirectUrl?: string; scheduled?: boolean }> {
  const { supabase, user } = await requireUser();
  if (!user?.email) return { error: "Not authenticated." };

  // Server Actions are public POST endpoints -- the TS types on these arguments are not enforced at runtime.
  if (!planSelectionSchema.safeParse({ planId, billingInterval, method }).success) return { error: "Invalid plan selection." };

  try {
    const current = await getResolvedSubscription(supabase, user.id);
    const currentPlanId = current?.plan_id ?? "free";
    const isPrepaid = current?.renewal_mode === "manual" && currentPlanId !== "free";

    if (method === "bank_transfer") {
      // Bank transfer buys a period of a paid plan: a new plan, an upgrade, or a renewal of a plan that was
      // itself prepaid. It can't be used to "downgrade", and paying by transfer on top of a card subscription
      // for the SAME plan would just be paying twice.
      if (planId === "free") return { error: "Free doesn't need a payment." };
      if (planId !== currentPlanId && !isUpgrade(currentPlanId, planId)) {
        return { error: `Your plan runs until ${formatDate(current?.current_period_end)}. You can switch to ${getPlan(planId).name} after it ends.` };
      }
      if (planId === currentPlanId && !isPrepaid) {
        return { error: "Your plan renews automatically by card. Use bank transfer if you'd like to upgrade." };
      }
      // The customer was shown a naira amount; never send them to pay a different one without telling them.
      if (typeof quotedAmountMinor === "number" && quotedAmountMinor !== transferAmountFor(planId, billingInterval)) {
        return { error: "The price in naira has been updated. Please review the new amount and try again." };
      }
    } else if (isPrepaid && planId !== currentPlanId) {
      if (planId === "free") {
        return { message: `Your plan was paid for by bank transfer and ends on ${formatDate(current?.current_period_end)}, then moves to Free. It won't renew.`, scheduled: true };
      }
      if (!isUpgrade(currentPlanId, planId)) {
        return { error: `Your plan runs until ${formatDate(current?.current_period_end)}. You can switch to ${getPlan(planId).name} after it ends.` };
      }
    }

    // A downgrade (to Free, or to a cheaper paid plan) never charges
    // immediately — it's scheduled for when the current paid period ends,
    // so the account isn't billed again for a plan it's already paid for
    // part of. Free -> anything and any move to a higher tier is still an
    // immediate checkout (or immediate switch, for Free). See
    // lib/billing/plans.ts's isUpgrade and services/billing-service.ts's
    // cancelSubscription/scheduleDowngrade.
    if (method === "card" && planId !== currentPlanId && !isUpgrade(currentPlanId, planId)) {
      const periodEnd = current?.current_period_end ? new Date(current.current_period_end) : null;
      const whenPhrase = periodEnd ? ` on ${periodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "";

      if (planId === "free") {
        await getBillingProvider().cancelSubscription(supabase, user.id);
      } else {
        await getBillingProvider().scheduleDowngrade(supabase, user.id, planId, billingInterval);
      }
      revalidatePath("/app/settings/billing");
      revalidatePath("/app", "layout");
      return {
        message: `You'll move to ${getPlan(planId).name}${whenPhrase}. You keep your current plan's benefits until then.`,
        scheduled: true,
      };
    }

    const result = await getBillingProvider().createCheckout(supabase, user.id, user.email, planId, billingInterval, method);
    revalidatePath("/app/settings/billing");
    revalidatePath("/app", "layout");
    return { message: result.message, redirectUrl: result.redirectUrl };
  } catch (err) {
    console.error("changePlanAction failed:", err);
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
  } catch (err) {
    console.error("cancelSubscriptionAction failed:", err);
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
  } catch (err) {
    if (err instanceof PrepaidPlanError) return { error: err.message };
    console.error("resumeSubscriptionAction failed:", err);
    return { error: "We couldn't resume your subscription. Please try again." };
  }
}

/** Downgrade grace handling (spec §28): the owner picks which brands stay active. */
export async function setActiveWorkspacesAction(workspaceIds: string[]): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };
  if (!z.array(z.string().uuid()).max(100).safeParse(workspaceIds).success) return { error: "Invalid selection." };

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
