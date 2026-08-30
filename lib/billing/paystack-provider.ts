// Paystack implementation of BillingProvider (spec v1.1 §7-17). Only
// getBillingProvider() in lib/billing/provider.ts instantiates this — it's
// selected automatically when PAYSTACK_SECRET_KEY is set. Nothing here ever
// marks a plan active on its own: createCheckout only starts a Paystack
// hosted-checkout session and returns a redirectUrl. Activation happens
// exclusively through activatePaidPlanFromPayment(), called from either the
// webhook route (app/api/webhooks/paystack/route.ts) or the verify-on-return
// path on the billing page — both of which call Paystack's server-to-server
// verify endpoint first (spec §17, §20). This file never trusts a
// client-supplied price, plan, or "success" flag.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PlanId, BillingInterval } from "@/types/database";
import {
  applyPlanChange,
  cancelSubscription as cancelSubscriptionInDb,
  resumeSubscription as resumeSubscriptionInDb,
  lockExcessWorkspaces,
} from "@/services/billing-service";
import { getPlanEntitlements, priceForInterval } from "@/lib/billing/plans";
import { initializeTransaction, verifyTransaction, verifyPaystackSignature } from "@/lib/billing/paystack-client";
import { getPaystackPlanCode, paystackPlanCodesConfigured } from "@/lib/billing/paystack-plan-codes";
import { activatePaidPlanFromPayment, recordBillingEvent } from "@/services/billing-service";
import { createAdminClient } from "@/lib/supabase/server";
import type { BillingProvider, CheckoutResult } from "@/lib/billing/provider";

type DB = SupabaseClient<Database>;

function appUrl(): string {
  // Same env var the rest of the app uses for absolute links (see app/(auth)/actions.ts).
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export class PaystackBillingProvider implements BillingProvider {
  readonly name = "paystack" as const;

  /**
   * Starts a Paystack-hosted checkout for a paid plan. Free stays a direct,
   * no-payment change — it never goes through Paystack (spec §9: "Free
   * requires no payment"). The price and plan code are both resolved
   * server-side from lib/billing/plans.ts and lib/billing/paystack-plan-codes.ts;
   * nothing about cost or identity is accepted from the caller beyond the
   * (planId, billingInterval) selection itself.
   */
  async createCheckout(
    supabase: DB,
    ownerId: string,
    email: string,
    planId: PlanId,
    billingInterval: BillingInterval,
  ): Promise<CheckoutResult> {
    if (planId === "free") {
      await this.changePlan(supabase, ownerId, planId, billingInterval);
      return { activated: true, message: "You're on the Free plan." };
    }

    if (!paystackPlanCodesConfigured()) {
      // Paystack is configured (secret key present) but the plan codes
      // aren't — don't silently activate a paid plan without payment; tell
      // the caller plainly instead of pretending checkout is available.
      return {
        activated: false,
        message: "Paystack plan codes aren't fully configured yet in this environment, so checkout can't be started for this plan.",
      };
    }

    const amountCents = priceForInterval(planId, billingInterval);
    const planCode = getPaystackPlanCode(planId, billingInterval);

    const result = await initializeTransaction({
      email,
      amountCents,
      currency: "USD",
      planCode,
      callbackUrl: `${appUrl()}/app/settings/billing`,
      metadata: {
        user_id: ownerId,
        workspace_id: null,
        plan_slug: planId,
        billing_interval: billingInterval,
        environment: process.env.NODE_ENV ?? "development",
      },
    });

    return {
      activated: false,
      message: "Redirecting you to Paystack to complete payment securely.",
      redirectUrl: result.authorization_url,
    };
  }

  /**
   * Direct, no-payment plan change — only reachable here for the Free plan
   * (see createCheckout above) or as an internal helper once payment has
   * already been verified elsewhere. Mirrors ManualBillingProvider's
   * changePlan exactly, since neither path collects payment itself.
   */
  async changePlan(_supabase: DB, ownerId: string, planId: PlanId, billingInterval: BillingInterval): Promise<void> {
    // Admin client — see the identical note in lib/billing/provider.ts's
    // ManualBillingProvider.changePlan (migration 0010 / audit §1).
    const admin = createAdminClient();
    await applyPlanChange(admin, ownerId, planId, billingInterval);
    const limit = getPlanEntitlements(planId).brands;
    await lockExcessWorkspaces(admin, ownerId, limit);
  }

  /**
   * Cancels locally (stays active until period end, per spec §29). This does
   * not also disable the subscription on Paystack's side in this version —
   * Paystack subscription management (their /subscription/disable endpoint)
   * is out of scope for what's been verified here; see the completion report
   * for exactly what's implemented vs. what would still need wiring for a
   * fully live recurring-billing lifecycle.
   */
  async cancelSubscription(supabase: DB, ownerId: string): Promise<void> {
    await cancelSubscriptionInDb(supabase, ownerId);
  }

  async resumeSubscription(supabase: DB, ownerId: string): Promise<void> {
    await resumeSubscriptionInDb(supabase, ownerId);
  }

  /** Delegates to the shared HMAC-SHA512 check — see paystack-client.ts for the exact scheme (spec §37). */
  verifyWebhook(rawBody: string, signatureHeader: string | null): boolean {
    return verifyPaystackSignature(rawBody, signatureHeader);
  }
}

export type VerifyReturnStatus = "activated" | "already_processed" | "not_successful" | "owner_mismatch" | "incomplete_metadata";

export interface VerifyReturnResult {
  status: VerifyReturnStatus;
  message: string;
}

/**
 * Server-authoritative "verify on return" path (spec v1.1 §17, §20): called
 * when the browser comes back from Paystack's hosted checkout with a
 * `?reference=` query param. The browser's mere presence back on this page —
 * or any client-supplied "success" flag — is never trusted on its own; this
 * always re-checks the transaction against Paystack's server directly via
 * GET /transaction/verify before anything is activated. This is the primary
 * activation path in environments (like local dev, or this sandbox) that
 * have no publicly reachable URL for Paystack to deliver a webhook to — see
 * app/api/webhooks/paystack/route.ts for the webhook path, which does the
 * same activation for any environment that *can* receive one.
 *
 * Must be called with the ADMIN client — see the comment above
 * activatePaidPlanFromPayment in services/billing-service.ts for why.
 */
export async function verifyAndActivatePaymentReference(
  adminSupabase: DB,
  expectedOwnerId: string,
  reference: string,
): Promise<VerifyReturnResult> {
  const tx = await verifyTransaction(reference);

  if (tx.status !== "success") {
    return { status: "not_successful", message: "This payment wasn't completed, so no plan change was made." };
  }

  const metaOwnerId = tx.metadata?.user_id;
  if (metaOwnerId !== expectedOwnerId) {
    // Never activate a plan for anyone other than the signed-in caller this
    // transaction's own metadata says it belongs to.
    return { status: "owner_mismatch", message: "This payment doesn't belong to your account." };
  }

  const planSlug = tx.metadata?.plan_slug as PlanId | undefined;
  const billingInterval = tx.metadata?.billing_interval as BillingInterval | undefined;
  if (!planSlug || !billingInterval) {
    return { status: "incomplete_metadata", message: "We verified the payment but couldn't determine which plan it was for. Contact support with reference " + reference + "." };
  }

  // Idempotency: a page refresh, back-button, or the webhook processing the
  // same charge must never allocate credits or reset the period twice.
  const { alreadyProcessed } = await recordBillingEvent(adminSupabase, {
    provider: "paystack",
    providerEventId: `verify_return:${reference}`,
    eventType: "charge.success",
    ownerId: expectedOwnerId,
    status: "processed",
  });
  if (alreadyProcessed) {
    return { status: "already_processed", message: "This payment was already applied to your account." };
  }

  await activatePaidPlanFromPayment(adminSupabase, expectedOwnerId, planSlug, billingInterval, {
    customerCode: tx.customer.customer_code ?? null,
    subscriptionCode: null,
  });

  return { status: "activated", message: `Payment verified — you're now on the ${planSlug} plan.` };
}
