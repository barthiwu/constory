// The single, centralized place Paystack plan codes are read from (spec
// v1.1 §12: "must not be hard-coded throughout the application"). Codes come
// from Plan objects created in the Paystack Dashboard/API — this file only
// maps our (PlanId, BillingInterval) pairs to the env var holding each one.
// Free never has a Paystack plan code (it never goes through checkout).

import type { PlanId, BillingInterval } from "@/types/database";

type PaidPlanId = Exclude<PlanId, "free">;

const ENV_VAR_BY_PLAN: Record<PaidPlanId, Record<BillingInterval, string | undefined>> = {
  creator: {
    monthly: process.env.PAYSTACK_PLAN_CODE_CREATOR_MONTHLY,
    quarterly: process.env.PAYSTACK_PLAN_CODE_CREATOR_QUARTERLY,
    annual: process.env.PAYSTACK_PLAN_CODE_CREATOR_ANNUAL,
  },
  pro: {
    monthly: process.env.PAYSTACK_PLAN_CODE_PRO_MONTHLY,
    quarterly: process.env.PAYSTACK_PLAN_CODE_PRO_QUARTERLY,
    annual: process.env.PAYSTACK_PLAN_CODE_PRO_ANNUAL,
  },
};

export class PaystackPlanCodeMissingError extends Error {}

/** Throws PaystackPlanCodeMissingError if the plan code hasn't been configured — never falls back to a guess. */
export function getPaystackPlanCode(planId: PaidPlanId, interval: BillingInterval): string {
  const code = ENV_VAR_BY_PLAN[planId]?.[interval];
  if (!code) {
    throw new PaystackPlanCodeMissingError(
      `No Paystack plan code configured for ${planId}/${interval}. Set PAYSTACK_PLAN_CODE_${planId.toUpperCase()}_${interval.toUpperCase()} in your environment.`,
    );
  }
  return code;
}

/** Whether every paid (plan, interval) pair has a configured Paystack plan code — used to decide if Paystack checkout can be offered at all. */
export function paystackPlanCodesConfigured(): boolean {
  return (Object.keys(ENV_VAR_BY_PLAN) as PaidPlanId[]).every((planId) =>
    (Object.keys(ENV_VAR_BY_PLAN[planId]) as BillingInterval[]).every((interval) => !!ENV_VAR_BY_PLAN[planId][interval]),
  );
}
