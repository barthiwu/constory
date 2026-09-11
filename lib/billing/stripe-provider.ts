// =============================================================================
// Stripe implementation of BillingProvider (lib/billing/provider.ts) — built
// ahead of time for V2, deliberately NOT wired up yet. getBillingProvider()
// still only ever returns PaystackBillingProvider or ManualBillingProvider;
// nothing imports StripeBillingProvider anywhere in the running app. Turning
// this on later means: install the `stripe` package, set STRIPE_SECRET_KEY /
// STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_ID_* (see .env.example), point
// getBillingProvider() at this class, and — importantly — actually test the
// checkout/webhook/cancel/resume paths live before shipping, none of which
// has happened in this environment (no Stripe account is configured here).
//
// Mirrors lib/billing/paystack-provider.ts's shape and the same DB
// primitives in services/billing-service.ts, so the rest of the app (the
// billing page, settings actions, the entitlements/credits system) needs no
// changes at all when this eventually replaces or joins Paystack — they all
// go through the BillingProvider interface, never a concrete class.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PlanId, BillingInterval } from "@/types/database";
import {
  applyPlanChange,
  cancelSubscription as cancelSubscriptionInDb,
  resumeSubscription as resumeSubscriptionInDb,
  scheduleDowngrade as scheduleDowngradeInDb,
  lockExcessWorkspaces,
  getSubscriptionAdmin,
} from "@/services/billing-service";
import { getPlanEntitlements, priceForInterval } from "@/lib/billing/plans";
import { getStripePriceId, stripePriceIdsConfigured } from "@/lib/billing/stripe-price-ids";
import { createAdminClient } from "@/lib/supabase/server";
import type { BillingProvider, CheckoutResult } from "@/lib/billing/provider";

type DB = SupabaseClient<Database>;

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stripeClient: any = null;

/**
 * Lazy, untyped require — same reasoning as lib/notifications/email.ts's
 * Resend client: `stripe` isn't installed in every environment this file
 * gets type-checked in, and this file isn't on any import path the running
 * app actually reaches, so failing at require-time (not at module-load
 * time) is the right place for that to surface.
 */
function getStripeClient() {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured.");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StripeModule = require("stripe");
  const Stripe = StripeModule.default ?? StripeModule;
  stripeClient = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
  return stripeClient;
}

/**
 * Finds or creates the Stripe Customer for this owner, caching the id on
 * the subscriptions row exactly like Paystack's provider_customer_id.
 */
async function resolveStripeCustomerId(admin: DB, ownerId: string, email: string): Promise<string> {
  const sub = await getSubscriptionAdmin(admin, ownerId);
  if (sub?.provider_customer_id && sub.provider === "stripe") return sub.provider_customer_id;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({ email, metadata: { constory_owner_id: ownerId } });
  await admin.from("subscriptions").update({ provider_customer_id: customer.id }).eq("owner_id", ownerId);
  return customer.id as string;
}

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe" as const;

  /**
   * Starts a Stripe Checkout session for a paid plan. Free stays a direct,
   * no-payment change, same as every other provider here — it never goes
   * through Stripe.
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

    if (!stripePriceIdsConfigured()) {
      return {
        activated: false,
        message: "Stripe Price ids aren't fully configured yet in this environment, so checkout can't be started for this plan.",
      };
    }

    const admin = createAdminClient();
    const customerId = await resolveStripeCustomerId(admin, ownerId, email);
    const priceId = getStripePriceId(planId, billingInterval);
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl()}/app/settings/billing?stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/app/settings/billing?payment=cancelled`,
      metadata: { constory_owner_id: ownerId, constory_plan_id: planId, constory_billing_interval: billingInterval },
      subscription_data: { metadata: { constory_owner_id: ownerId, constory_plan_id: planId, constory_billing_interval: billingInterval } },
    });

    if (!session.url) {
      return { activated: false, message: "Stripe didn't return a checkout URL. Please try again." };
    }
    return { activated: false, message: "Redirecting to Stripe checkout…", redirectUrl: session.url };
  }

  /**
   * Cancels the live Stripe subscription at period end and mirrors that
   * locally via the same provider-agnostic DB primitive Paystack uses.
   * Unlike Paystack, Stripe's own `cancel_at_period_end` flag is natively
   * reversible (see resumeSubscription below) — no "disable is permanent,
   * always create a fresh subscription to resume" workaround needed here.
   */
  async cancelSubscription(supabase: DB, ownerId: string): Promise<void> {
    const admin = createAdminClient();
    const sub = await getSubscriptionAdmin(admin, ownerId);
    if (sub?.provider === "stripe" && sub.provider_subscription_id) {
      const stripe = getStripeClient();
      await stripe.subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: true });
    }
    await cancelSubscriptionInDb(supabase, ownerId);
  }

  async resumeSubscription(supabase: DB, ownerId: string): Promise<void> {
    const admin = createAdminClient();
    const sub = await getSubscriptionAdmin(admin, ownerId);
    if (sub?.provider === "stripe" && sub.provider_subscription_id) {
      const stripe = getStripeClient();
      await stripe.subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: false });
    }
    await resumeSubscriptionInDb(supabase, ownerId);
  }

  /** No-payment direct switch (Free, or an admin/manual correction) — identical to ManualBillingProvider.changePlan. */
  async changePlan(_supabase: DB, ownerId: string, planId: PlanId, billingInterval: BillingInterval): Promise<void> {
    const admin = createAdminClient();
    await applyPlanChange(admin, ownerId, planId, billingInterval);
    await lockExcessWorkspaces(admin, ownerId, getPlanEntitlements(planId).brands);
  }

  /**
   * TODO before activating in V2: this only writes the local pending-change
   * state (same as every other provider) — it does NOT yet call Stripe to
   * actually swap the subscription's Price at period end. Stripe's own
   * primitive for that is either `subscription_schedules` (phases) or a
   * plain `subscriptions.update` with `proration_behavior: 'none'` timed to
   * fire from a `current_period_end`-triggered webhook — pick one and wire
   * it in here once this provider is live, mirroring how
   * getResolvedSubscription()/resolve_scheduled_plan_change() already
   * reconcile the LOCAL pending state at read time for Paystack.
   */
  async scheduleDowngrade(_supabase: DB, ownerId: string, planId: PlanId, billingInterval: BillingInterval): Promise<void> {
    await scheduleDowngradeInDb(ownerId, planId, billingInterval);
  }

  /** HMAC verification via Stripe's SDK against STRIPE_WEBHOOK_SECRET. */
  verifyWebhook(rawBody: string, signatureHeader: string | null): boolean {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signatureHeader) return false;
    try {
      const stripe = getStripeClient();
      stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
      return true;
    } catch {
      return false;
    }
  }
}

/** Just the price shown for a plan/interval — Stripe itself is the source of truth for what it actually charges once a Price id is configured; this stays for UI display consistency with the Paystack provider before checkout starts. */
export function displayPriceForInterval(planId: PlanId, billingInterval: BillingInterval): number {
  return priceForInterval(planId, billingInterval);
}
