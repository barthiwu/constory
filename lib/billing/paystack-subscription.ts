// Higher-level Paystack subscription-lifecycle helpers, sitting on top of
// the plain REST calls in lib/billing/paystack-client.ts. Used by
// lib/billing/paystack-provider.ts (schedule/cancel/resume) and
// services/billing-service.ts (getResolvedSubscription's real-charge
// branch) — pulled out into their own file so those two don't have to
// import each other.

import { fetchCustomerSubscriptions } from "@/lib/billing/paystack-client";

export interface ResolvedProviderSubscription {
  subscriptionCode: string;
  emailToken: string;
  authorizationCode: string | null;
}

/**
 * Finds a customer's current Paystack subscription when our own row doesn't
 * already have `provider_subscription_id` / `provider_subscription_token`
 * recorded — the fallback path for any subscription activated before this
 * fix started persisting them directly (see activatePaidPlanFromPayment).
 * Prefers a `status === "active"` subscription; falls back to whatever's
 * first if none is marked active (e.g. it's already past_due on Paystack's
 * side too, which is still the one we want to act on).
 */
export async function resolveActiveProviderSubscription(customerCode: string): Promise<ResolvedProviderSubscription | null> {
  const subs = await fetchCustomerSubscriptions(customerCode);
  if (subs.length === 0) return null;
  const active = subs.find((s) => s.status === "active") ?? subs[0];
  return {
    subscriptionCode: active.subscription_code,
    emailToken: active.email_token,
    authorizationCode: active.authorization?.authorization_code ?? null,
  };
}
