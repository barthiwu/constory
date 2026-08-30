// Payment-provider abstraction (spec §24-25, v1.1 §7). Paystack is the
// confirmed provider (see lib/billing/paystack-provider.ts) but nothing else
// in the app imports it directly — every caller goes through
// `getBillingProvider()`, which is the only place that decides which
// concrete implementation is active. See PHASE7_5_COMPLETION_REPORT.md
// section H for exactly what is and isn't live in this environment.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PlanId, BillingInterval } from "@/types/database";
import { applyPlanChange, cancelSubscription, resumeSubscription, getWorkspaceOwnerId, lockExcessWorkspaces } from "@/services/billing-service";
import { getPlanEntitlements } from "@/lib/billing/plans";
import { isPaystackConfigured } from "@/lib/billing/paystack-client";

type DB = SupabaseClient<Database>;

export interface CheckoutResult {
  /** True once the plan is actually active (immediately, for a free/no-payment change). False means the user still needs to complete `redirectUrl`. */
  activated: boolean;
  /** A message safe to show the user explaining what happened. */
  message: string;
  /** Present when the user needs to be sent to a hosted checkout page to complete payment (spec §9, §15). */
  redirectUrl?: string;
}

export interface BillingProvider {
  readonly name: "none" | "manual" | "paystack";
  /**
   * Starts a plan purchase/change. `email` is required for providers that
   * need it to create a checkout session (Paystack); providers that never
   * collect payment (Manual, Free) ignore it.
   */
  createCheckout(supabase: DB, ownerId: string, email: string, planId: PlanId, billingInterval: BillingInterval): Promise<CheckoutResult>;
  /** Cancels a paid subscription — remains active until the current period ends (spec §29). */
  cancelSubscription(supabase: DB, ownerId: string): Promise<void>;
  /** Reverses a pending cancellation. */
  resumeSubscription(supabase: DB, ownerId: string): Promise<void>;
  /** Switches plan/interval directly with no payment step — used for Free, and by the manual provider. */
  changePlan(supabase: DB, ownerId: string, planId: PlanId, billingInterval: BillingInterval): Promise<void>;
  /**
   * Verifies an inbound webhook payload's authenticity before any of its
   * contents are trusted (spec §37). The manual provider has no webhooks —
   * this always returns false, since nothing should ever be trusted as a
   * "verified provider event" while no provider is connected.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null): boolean;
}

/**
 * Fallback provider, used whenever Paystack isn't configured (no
 * PAYSTACK_SECRET_KEY in this environment). It does NOT collect payment —
 * `createCheckout` activates the plan change directly and reports
 * `activated: true` with a message that makes the lack of real billing
 * explicit. This exists so the rest of the commercial system (entitlements,
 * credits, upgrade/downgrade UI, the billing page) can be built and tested
 * end-to-end without a live processor connected.
 */
class ManualBillingProvider implements BillingProvider {
  readonly name = "manual" as const;

  async createCheckout(supabase: DB, ownerId: string, _email: string, planId: PlanId, billingInterval: BillingInterval): Promise<CheckoutResult> {
    await this.changePlan(supabase, ownerId, planId, billingInterval);
    if (planId === "free") return { activated: true, message: "You're on the Free plan." };
    return {
      activated: true,
      message:
        "No payment provider is connected yet in this environment, so this plan change took effect immediately without collecting payment. When Paystack is configured (PAYSTACK_SECRET_KEY + plan codes), this will go through a real checkout.",
    };
  }

  async changePlan(supabase: DB, ownerId: string, planId: PlanId, billingInterval: BillingInterval): Promise<void> {
    await applyPlanChange(supabase, ownerId, planId, billingInterval);
    const limit = getPlanEntitlements(planId).brands;
    await lockExcessWorkspaces(supabase, ownerId, limit);
  }

  async cancelSubscription(supabase: DB, ownerId: string): Promise<void> {
    await cancelSubscription(supabase, ownerId);
  }

  async resumeSubscription(supabase: DB, ownerId: string): Promise<void> {
    await resumeSubscription(supabase, ownerId);
  }

  verifyWebhook(): boolean {
    return false;
  }
}

let _provider: BillingProvider | null = null;

export function getBillingProvider(): BillingProvider {
  if (_provider) return _provider;

  if (isPaystackConfigured()) {
    // Lazy require to avoid pulling Paystack code into bundles/paths that
    // never need it, and to avoid a hard crash at import time in
    // environments (like this one) that simply don't have the key set.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PaystackBillingProvider } = require("@/lib/billing/paystack-provider") as typeof import("@/lib/billing/paystack-provider");
    _provider = new PaystackBillingProvider();
  } else {
    _provider = new ManualBillingProvider();
  }
  return _provider;
}

/** Convenience for server actions that only have a workspaceId in hand. */
export async function getBillingOwnerId(supabase: DB, workspaceId: string): Promise<string | null> {
  return getWorkspaceOwnerId(supabase, workspaceId);
}
