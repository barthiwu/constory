import type { BillingInterval } from "@/types/database";
import type { PaidPlanId, PaymentExpectations } from "@/lib/billing/payment-guard";
import { priceForInterval } from "@/lib/billing/plans";
import { getPaystackPlanCode } from "@/lib/billing/paystack-plan-codes";
import { CHARGE_CURRENCY, usdCentsToChargeCurrencyMinorUnits } from "@/lib/billing/currency";

/** What OUR server expects a payment for (plan, interval) to look like. Never throws: unknowns become null. */
export function expectedPaymentFor(planId: PaidPlanId, interval: BillingInterval): PaymentExpectations {
  let planCode: string | null = null;
  try {
    planCode = getPaystackPlanCode(planId, interval);
  } catch {
    planCode = null;
  }
  let expectedAmountMinor: number | null = null;
  try {
    expectedAmountMinor = usdCentsToChargeCurrencyMinorUnits(priceForInterval(planId, interval));
  } catch {
    expectedAmountMinor = null;
  }
  return { planCode, expectedAmountMinor, chargeCurrency: CHARGE_CURRENCY };
}

/** One idempotency key per Paystack charge, shared by the webhook and the verify-on-return path so a charge is only ever applied once. */
export function chargeIdempotencyKey(reference: string): string {
  return `paystack_charge:${reference}`;
}
