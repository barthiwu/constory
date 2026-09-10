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
import type { Database, PlanId, BillingInterval, Subscription } from "@/types/database";
import {
  applyPlanChange,
  cancelSubscription as cancelSubscriptionInDb,
  resumeSubscription as resumeSubscriptionInDb,
  scheduleDowngrade as scheduleDowngradeInDb,
  lockExcessWorkspaces,
  getSubscriptionAdmin,
} from "@/services/billing-service";
import { getPlanEntitlements, priceForInterval } from "@/lib/billing/plans";
import {
  initializeTransaction,
  verifyTransaction,
  verifyPaystackSignature,
  disableSubscription,
  createSubscription as createPaystackSubscription,
  PaystackAPIError,
} from "@/lib/billing/paystack-client";
import { resolveActiveProviderSubscription } from "@/lib/billing/paystack-subscription";
import { getPaystackPlanCode, paystackPlanCodesConfigured } from "@/lib/billing/paystack-plan-codes";
import { CHARGE_CURRENCY, usdCentsToChargeCurrencyMinorUnits, currentUsdToChargeCurrencyRate } from "@/lib/billing/currency";
import { activatePaidPlanFromPayment, recordBillingEvent } from "@/services/billing-service";
import { createAdminClient } from "@/lib/supabase/server";
import type { BillingProvider, CheckoutResult } from "@/lib/billing/provider";

type DB = SupabaseClient<Database>;

function appUrl(): string {
  // Same env var the rest of the app uses for absolute links (see app/(auth)/actions.ts).
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Disables the account's live Paystack subscription so it can't auto-charge
 * again, ahead of a local cancel/downgrade schedule taking effect — called
 * by both cancelSubscription and scheduleDowngrade below, since both need
 * exactly the same "stop the old recurring charge" step. A no-op (not an
 * error) for an account that was never really on Paystack (manual/free, or
 * `provider_customer_id` never got recorded) — nothing to disable there.
 *
 * Always resolves the CURRENT subscription_code/email_token live from
 * Paystack (GET /customer/:code) rather than trusting the row's cached
 * values — confirmed in testing that Paystack rotates/invalidates these
 * across an enable/disable cycle (disable -> enable -> disable again failed
 * with "Subscription with code not found or already inactive" using a code
 * that had disabled successfully minutes earlier). The cached columns are
 * only a fallback for when the live lookup itself can't be done (e.g. the
 * customer has no subscriptions at all on Paystack's side right now).
 *
 * Deliberately lets a Paystack API failure propagate: cancelSubscription/
 * scheduleDowngrade in this class call this BEFORE writing the local
 * pending-change state, so if Paystack can't actually be told to stop
 * billing the old plan, the app doesn't tell the user it scheduled a
 * downgrade it can't guarantee — better to surface an error and let them
 * retry than to silently leave the old subscription live.
 */
async function disableLivePaystackSubscription(ownerId: string): Promise<void> {
  const admin = createAdminClient();
  const sub = await getSubscriptionAdmin(admin, ownerId);
  if (!sub || sub.provider !== "paystack" || !sub.provider_customer_id) return;

  const resolved = await resolveActiveProviderSubscription(sub.provider_customer_id);
  const code = resolved?.subscriptionCode ?? sub.provider_subscription_id;
  const token = resolved?.emailToken ?? sub.provider_subscription_token;
  if (!code || !token) return; // Nothing active on Paystack's side either — nothing to disable.

  if (resolved && (resolved.subscriptionCode !== sub.provider_subscription_id || resolved.emailToken !== sub.provider_subscription_token)) {
    const update: Partial<Subscription> = { provider_subscription_id: resolved.subscriptionCode, provider_subscription_token: resolved.emailToken };
    if (resolved.authorizationCode && !sub.provider_authorization_code) {
      update.provider_authorization_code = resolved.authorizationCode;
    }
    const { error } = await admin.from("subscriptions").update(update).eq("owner_id", ownerId);
    if (error) throw error;
  }

  try {
    await disableSubscription(code, token);
  } catch (err) {
    // Confirmed live (see scripts/check-subscription.mjs): Paystack can drop a
    // subscription from the customer's list entirely once it's been through a
    // disable, so a second disable attempt (e.g. schedule-downgrade, "Keep my
    // plan", then Cancel) legitimately finds nothing left to disable and
    // returns 404 "Subscription with code not found or already inactive".
    // That's not a failure — the thing disable is FOR (stop the old plan from
    // auto-charging again) is already true — so swallow only this specific
    // case and let every other Paystack error still propagate.
    if (!(err instanceof PaystackAPIError && err.status === 404)) throw err;
  }
}

/**
 * Reverses disableLivePaystackSubscription — called by resumeSubscription
 * ("Keep my plan") to undo a scheduled cancel/downgrade before it takes
 * effect, by making sure the account has a real, active recurring
 * subscription on Paystack again for its CURRENT plan.
 *
 * Confirmed live (see scripts/check-subscription.mjs): once a Paystack
 * subscription has been disabled, POST /subscription/enable rejects it
 * outright ("Subscription has been cancelled, and cannot be reactivated")
 * — disable is a one-way door on Paystack's side, not a pause. So this
 * doesn't bother attempting enable at all; it goes straight to creating a
 * brand new subscription on the current plan, reusing the account's saved
 * card (authorization_code) — the same mechanism getResolvedSubscription
 * uses to charge a resolved downgrade. No new checkout, no card re-entry.
 *
 * Best-effort/non-throwing: failing to restore real billing on Paystack's
 * end shouldn't block the user from reversing the change locally (worst
 * case they end up needing a fresh checkout, which is still recoverable —
 * whereas silently NOT disabling on schedule is the scenario worth
 * blocking on, handled separately in disableLivePaystackSubscription).
 */
async function enableLivePaystackSubscriptionIfPending(ownerId: string): Promise<void> {
  const admin = createAdminClient();
  const sub = await getSubscriptionAdmin(admin, ownerId);
  if (!sub || !sub.pending_plan_id || sub.provider !== "paystack" || !sub.provider_customer_id) return;
  if (!sub.provider_authorization_code || sub.plan_id === "free") return;

  try {
    const planCode = getPaystackPlanCode(sub.plan_id, sub.billing_interval);
    const created = await createPaystackSubscription({
      customerCode: sub.provider_customer_id,
      planCode,
      authorizationCode: sub.provider_authorization_code,
    });
    await admin
      .from("subscriptions")
      .update({ provider_subscription_id: created.subscription_code, provider_subscription_token: created.email_token })
      .eq("owner_id", ownerId);
  } catch {
    // Best-effort — see the comment above.
  }
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

    const usdCents = priceForInterval(planId, billingInterval);
    const planCode = getPaystackPlanCode(planId, billingInterval);

    // Prices are always shown in USD (lib/billing/plans.ts), but this
    // Paystack integration can only charge in CHARGE_CURRENCY — see
    // lib/billing/currency.ts for why, and note that Paystack actually
    // charges the Plan's own configured amount for plan-code checkouts
    // regardless of what we send here.
    const fxRate = currentUsdToChargeCurrencyRate();
    const result = await initializeTransaction({
      email,
      amountCents: usdCentsToChargeCurrencyMinorUnits(usdCents),
      currency: CHARGE_CURRENCY,
      planCode,
      callbackUrl: `${appUrl()}/app/settings/billing`,
      metadata: {
        user_id: ownerId,
        workspace_id: null,
        plan_slug: planId,
        billing_interval: billingInterval,
        environment: process.env.NODE_ENV ?? "development",
        usd_amount_cents: usdCents,
        fx_rate_to_charge_currency: fxRate,
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
   * Cancels locally (stays active until period end, per spec §29) and, on a
   * real Paystack subscription, disables it on Paystack's side too — see
   * disableLivePaystackSubscription above — so the old plan is never
   * charged again once the period ends. For an account not actually on
   * Paystack (manual/free), that step is a no-op and this behaves exactly
   * as before.
   */
  async cancelSubscription(supabase: DB, ownerId: string): Promise<void> {
    await disableLivePaystackSubscription(ownerId);
    await cancelSubscriptionInDb(supabase, ownerId);
  }

  async resumeSubscription(supabase: DB, ownerId: string): Promise<void> {
    await enableLivePaystackSubscriptionIfPending(ownerId);
    await resumeSubscriptionInDb(supabase, ownerId);
  }

  /**
   * Schedules a downgrade to a cheaper paid plan for when the current
   * period ends. As of the Paystack subscription-lifecycle fix, this now
   * also disables the account's live Paystack subscription immediately —
   * see disableLivePaystackSubscription above — so Paystack itself stops
   * billing the OLD (higher) plan price. The actual switch to the new,
   * cheaper plan's Paystack subscription happens lazily once the period
   * really ends — see getResolvedSubscription in services/billing-service.ts,
   * which creates it via the stored `provider_authorization_code` at that
   * point, charging the new plan's price automatically with no new
   * checkout or card re-entry needed from the customer.
   */
  async scheduleDowngrade(_supabase: DB, ownerId: string, planId: PlanId, billingInterval: BillingInterval): Promise<void> {
    await disableLivePaystackSubscription(ownerId);
    await scheduleDowngradeInDb(ownerId, planId, billingInterval);
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

  // The transaction-verify response carries the card's reusable
  // authorization directly, but Paystack creates the recurring Subscription
  // object asynchronously from a plan-code checkout — it's not on this
  // response at all, so it's looked up separately (best-effort: if it's not
  // there yet, cancelSubscription/scheduleDowngrade fall back to the same
  // lookup later when they actually need it).
  const authorizationCode = tx.authorization?.authorization_code ?? null;
  let subscriptionCode: string | null = null;
  let subscriptionToken: string | null = null;
  if (tx.customer.customer_code) {
    try {
      const resolved = await resolveActiveProviderSubscription(tx.customer.customer_code);
      if (resolved) {
        subscriptionCode = resolved.subscriptionCode;
        subscriptionToken = resolved.emailToken;
      }
    } catch {
      // Non-fatal — see the comment above.
    }
  }

  await activatePaidPlanFromPayment(adminSupabase, expectedOwnerId, planSlug, billingInterval, {
    customerCode: tx.customer.customer_code ?? null,
    subscriptionCode,
    subscriptionToken,
    authorizationCode,
  });

  return { status: "activated", message: `Payment verified — you're now on the ${planSlug} plan.` };
}
