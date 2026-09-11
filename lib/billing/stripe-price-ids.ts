// Mirrors lib/billing/paystack-plan-codes.ts's shape exactly, for Stripe
// Price ids instead of Paystack Plan codes. Not used by anything live yet —
// see lib/billing/stripe-provider.ts's file header. Free never has a Stripe
// Price (it never goes through checkout).

import type { PlanId, BillingInterval } from "@/types/database";

type PaidPlanId = Exclude<PlanId, "free">;

const ENV_VAR_BY_PLAN: Record<PaidPlanId, Record<BillingInterval, string | undefined>> = {
  creator: {
    monthly: process.env.STRIPE_PRICE_ID_CREATOR_MONTHLY,
    quarterly: process.env.STRIPE_PRICE_ID_CREATOR_QUARTERLY,
    annual: process.env.STRIPE_PRICE_ID_CREATOR_ANNUAL,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    quarterly: process.env.STRIPE_PRICE_ID_PRO_QUARTERLY,
    annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL,
  },
};

export class StripePriceIdMissingError extends Error {}

/** Throws StripePriceIdMissingError if the Price id hasn't been configured — never falls back to a guess. */
export function getStripePriceId(planId: PaidPlanId, interval: BillingInterval): string {
  const id = ENV_VAR_BY_PLAN[planId]?.[interval];
  if (!id) {
    throw new StripePriceIdMissingError(
      `No Stripe Price id configured for ${planId}/${interval}. Set STRIPE_PRICE_ID_${planId.toUpperCase()}_${interval.toUpperCase()} in your environment.`,
    );
  }
  return id;
}

/** Whether every paid (plan, interval) pair has a configured Stripe Price id. */
export function stripePriceIdsConfigured(): boolean {
  return (Object.keys(ENV_VAR_BY_PLAN) as PaidPlanId[]).every((planId) =>
    (Object.keys(ENV_VAR_BY_PLAN[planId]) as BillingInterval[]).every((interval) => !!ENV_VAR_BY_PLAN[planId][interval]),
  );
}
