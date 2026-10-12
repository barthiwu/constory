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
  createRefund,
  verifyTransaction,
  verifyPaystackSignature,
  disableSubscription,
  createSubscription as createPaystackSubscription,
  PaystackAPIError,
} from "@/lib/billing/paystack-client";
import { resolveActiveProviderSubscription } from "@/lib/billing/paystack-subscription";
import { getPaystackPlanCode, paystackPlanCodesConfigured } from "@/lib/billing/paystack-plan-codes";
import { CHARGE_CURRENCY, usdCentsToChargeCurrencyMinorUnits, currentUsdToChargeCurrencyRate, formatMinorUnits } from "@/lib/billing/currency";
import { createTransferQuote } from "@/lib/billing/transfer-quote";
import { activatePaidPlanFromPayment, activatePrepaidPlanFromPayment, recordBillingEvent, releaseBillingEvent } from "@/services/billing-service";
import { checkPaymentMatchesPlan, isOneOffPayment, parsePaidPlanSelection, type PaidPlanId } from "@/lib/billing/payment-guard";
import { expectedPaymentFor, chargeIdempotencyKey, transferAmountFor } from "@/lib/billing/payment-expectations";
import { createAdminClient } from "@/lib/supabase/server";
import type { BillingProvider, CheckoutResult, PaymentMethod } from "@/lib/billing/provider";

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
    method: PaymentMethod = "card",
  ): Promise<CheckoutResult> {
    if (planId === "free") {
      await this.changePlan(supabase, ownerId, planId, billingInterval);
      return { activated: true, message: "You're on the Free plan." };
    }

    if (method === "bank_transfer") {
      return this.createBankTransferCheckout(ownerId, email, planId, billingInterval);
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
   * One-off payment by bank transfer. Paystack's checkout shows the customer a single-use account
   * number to transfer to and confirms the payment the moment the money lands (webhook and/or the
   * redirect back to the billing page). There is no `plan` on this transaction because Paystack
   * can only bill a plan to a card: a transfer leaves nothing to charge again, so the plan runs for
   * the period paid for and is renewed by paying again (see activatePrepaidPlanFromPayment).
   *
   * The amount is computed here from our own USD price list and FX rate -- never from the client --
   * and re-checked against the same figure when the payment comes back (payment-guard.ts).
   * Bank transfer is a Nigerian channel, so it is only offered when we charge in NGN.
   */
  private async createBankTransferCheckout(
    ownerId: string,
    email: string,
    planId: PaidPlanId,
    billingInterval: BillingInterval,
  ): Promise<CheckoutResult> {
    if (CHARGE_CURRENCY.toUpperCase() !== "NGN") {
      return { activated: false, message: "Bank transfer is only available for payments in NGN." };
    }

    const usdCents = priceForInterval(planId, billingInterval);
    // Whole naira, signed into the transaction: the payment is only accepted for exactly this amount.
    const amountMinor = transferAmountFor(planId, billingInterval);
    const quote = createTransferQuote({ userId: ownerId, planId, billingInterval, amountMinor });
    const result = await initializeTransaction({
      email,
      amountCents: amountMinor,
      currency: CHARGE_CURRENCY,
      channels: ["bank_transfer"],
      callbackUrl: `${appUrl()}/app/settings/billing`,
      metadata: {
        user_id: ownerId,
        workspace_id: null,
        plan_slug: planId,
        billing_interval: billingInterval,
        payment_method: "bank_transfer",
        environment: process.env.NODE_ENV ?? "development",
        usd_amount_cents: usdCents,
        fx_rate_to_charge_currency: currentUsdToChargeCurrencyRate(),
        ...quote,
      },
    });

    return {
      activated: false,
      message: `Redirecting you to Paystack. Transfer exactly ${formatMinorUnits(amountMinor, CHARGE_CURRENCY)}.`,
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

export type VerifyReturnStatus = "activated" | "already_processed" | "not_successful" | "owner_mismatch" | "incomplete_metadata" | "payment_mismatch" | "wrong_amount_refunded" | "wrong_amount_refund_failed";

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

  const selection = parsePaidPlanSelection(tx.metadata?.plan_slug, tx.metadata?.billing_interval);
  if (!selection) {
    return { status: "incomplete_metadata", message: "We verified the payment but couldn't determine which plan it was for. Contact support with reference " + reference + "." };
  }
  const { planId: planSlug, billingInterval } = selection;

  // A successful verify only proves Paystack processed SOME payment under this reference -- not
  // that it was for the plan the (attacker-influenceable) metadata names. Cross-check the plan
  // code / amount actually paid against what our server expects for that plan.
  const verdict = checkPaymentMatchesPlan(
    {
      amount: tx.amount,
      currency: tx.currency,
      plan: tx.plan,
      channel: tx.channel ?? null,
      metadata: tx.metadata,
      claim: { userId: expectedOwnerId, planId: planSlug, billingInterval },
    },
    expectedPaymentFor(planSlug, billingInterval),
  );
  if (!verdict.ok && verdict.refund) {
    const quoted = typeof tx.metadata?.quote_amount === "number" ? tx.metadata.quote_amount : null;
    const refund = await refundWrongAmountPayment(adminSupabase, { ownerId: expectedOwnerId, reference, detail: verdict.reason });
    const paidText = formatMinorUnits(tx.amount, tx.currency);
    const quotedText = quoted !== null ? formatMinorUnits(quoted, tx.currency) : "the quoted amount";
    return refund.started
      ? {
          status: "wrong_amount_refunded",
          message: `We received ${paidText} but the plan costs exactly ${quotedText}, so it wasn't activated. A refund of ${paidText} has been started and should reach you within a day or two.`,
        }
      : {
          status: "wrong_amount_refund_failed",
          message: `We received ${paidText} but the plan costs exactly ${quotedText}, so it wasn't activated. We couldn't start the refund automatically -- contact support with reference ${reference} and we'll refund you.`,
        };
  }
  if (!verdict.ok) {
    return { status: "payment_mismatch", message: "This payment doesn't match the plan it was made for, so no plan change was made. Contact support with reference " + reference + "." };
  }

  // Idempotency: a page refresh, back-button, or the webhook processing the
  // same charge must never allocate credits or reset the period twice.
  // Same key the webhook uses for this charge (see chargeIdempotencyKey): whichever path gets
  // here first wins; the other becomes a no-op instead of re-resetting the period's credits.
  const idempotencyKey = chargeIdempotencyKey(reference);
  const { alreadyProcessed } = await recordBillingEvent(adminSupabase, {
    provider: "paystack",
    providerEventId: idempotencyKey,
    eventType: "charge.success",
    ownerId: expectedOwnerId,
    status: "processed",
  });
  if (alreadyProcessed) {
    return { status: "already_processed", message: "This payment was already applied to your account." };
  }

  try {
    const outcome = await applyVerifiedPaystackPayment(adminSupabase, {
      ownerId: expectedOwnerId,
      planId: planSlug,
      billingInterval,
      plan: tx.plan,
      customerCode: tx.customer.customer_code ?? null,
      authorizationCode: tx.authorization?.authorization_code ?? null,
    });
    if (outcome.prepaid) {
      const until = new Date(outcome.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return { status: "activated", message: `Payment verified — you're on the ${planSlug} plan until ${until}.` };
    }
  } catch (err) {
    // Don't leave a "processed" claim behind for an activation that didn't happen, or the
    // user's retry (and the webhook) would both be told it was "already applied".
    await releaseBillingEvent(adminSupabase, "paystack", idempotencyKey).catch(() => {});
    throw err;
  }

  return { status: "activated", message: `Payment verified — you're now on the ${planSlug} plan.` };
}

/**
 * The ONE place a verified Paystack payment becomes a plan, shared by the webhook and the
 * verify-on-return path so they can never disagree.
 *
 * - Made against a Paystack plan (card): recurring. Record the card token and the Paystack
 *   subscription so renewals, downgrades and cancellation work.
 * - Not made against a plan (bank transfer): prepaid. Stop any live card subscription first (the
 *   customer must not be charged by the old one as well), then activate the plan for the period
 *   that was paid for. A failure to disable propagates so the caller releases its idempotency
 *   claim and the event is retried, rather than leaving the customer double-billed.
 *
 * The caller has already verified the payment (signature or /transaction/verify) and run
 * checkPaymentMatchesPlan.
 */
export async function applyVerifiedPaystackPayment(
  adminSupabase: DB,
  payment: {
    ownerId: string;
    planId: PaidPlanId;
    billingInterval: BillingInterval;
    /** Paystack's `plan` field of the transaction: a plan code / object for a card subscription, empty for a one-off payment. */
    plan: unknown;
    customerCode: string | null;
    authorizationCode: string | null;
  },
): Promise<{ prepaid: false } | { prepaid: true; extended: boolean; periodEnd: string }> {
  const { ownerId, planId, billingInterval, customerCode } = payment;

  if (isOneOffPayment(payment.plan)) {
    await disableLivePaystackSubscription(ownerId);
    const result = await activatePrepaidPlanFromPayment(adminSupabase, ownerId, planId, billingInterval, { customerCode });
    return { prepaid: true, ...result };
  }

  // The transaction carries the card's reusable authorization directly, but Paystack creates the
  // recurring Subscription object asynchronously from a plan-code checkout, so it is looked up
  // separately (best-effort: cancelSubscription/scheduleDowngrade fall back to the same lookup
  // later when they actually need it).
  let subscriptionCode: string | null = null;
  let subscriptionToken: string | null = null;
  if (customerCode) {
    try {
      const resolved = await resolveActiveProviderSubscription(customerCode);
      if (resolved) {
        subscriptionCode = resolved.subscriptionCode;
        subscriptionToken = resolved.emailToken;
      }
    } catch {
      // Non-fatal -- see the comment above.
    }
  }

  await activatePaidPlanFromPayment(adminSupabase, ownerId, planId, billingInterval, {
    customerCode,
    subscriptionCode,
    subscriptionToken,
    authorizationCode: payment.authorizationCode,
  });
  return { prepaid: false };
}

/**
 * A verifiably-ours bank transfer arrived for the wrong amount and Paystack nonetheless marked it successful
 * (for a wrong amount Paystack normally fails the payment and refunds it itself, but a transaction that DID
 * succeed is money we hold that matches no plan). Nothing is activated; ask Paystack to refund it in full.
 * Idempotent per reference, so a webhook plus a page reload can't ask twice. A failed request is recorded as
 * an error event for an operator to settle by hand -- it is never retried automatically.
 */
export async function refundWrongAmountPayment(
  adminSupabase: DB,
  input: { ownerId: string; reference: string; detail: string },
): Promise<{ started: boolean; alreadyRequested: boolean }> {
  const key = `paystack_refund:${input.reference}`;
  const { alreadyProcessed } = await recordBillingEvent(adminSupabase, {
    provider: "paystack",
    providerEventId: key,
    eventType: "wrong_amount_refund",
    ownerId: input.ownerId,
    status: "processed",
    detail: input.detail,
  });
  if (alreadyProcessed) return { started: true, alreadyRequested: true };

  try {
    await createRefund(input.reference, "Wrong transfer amount - plan not activated");
    return { started: true, alreadyRequested: false };
  } catch (err) {
    await recordBillingEvent(adminSupabase, {
      provider: "paystack",
      providerEventId: `${key}:failed:${Date.now()}`,
      eventType: "wrong_amount_refund",
      ownerId: input.ownerId,
      status: "error",
      detail: `Refund request failed for ${input.reference} -- refund it manually in the Paystack dashboard. ${err instanceof Error ? err.message : ""}`,
    }).catch(() => {});
    console.error("[paystack] could not start a refund for a wrong-amount transfer:", input.reference, err);
    return { started: false, alreadyRequested: false };
  }
}
