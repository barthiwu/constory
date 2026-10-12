// Defense-in-depth checks applied to every Paystack payment (webhook AND
// verify-on-return) before a plan is activated. A valid signature / a
// successful /transaction/verify only proves "Paystack processed SOME
// payment"; it does not prove the payment was for the plan its metadata
// claims. Metadata is just a key/value bag attached when the transaction was
// initialized -- anyone able to initialize a transaction on this merchant
// account (e.g. through Paystack Inline using the public key) could attach
// `plan_slug: "pro"` to a trivial charge. So the plan code and amount actually
// paid are cross-checked against what OUR server expects for that plan.

import type { BillingInterval, PlanId } from "@/types/database";
import { verifyTransferQuote } from "@/lib/billing/transfer-quote";

export type PaidPlanId = Exclude<PlanId, "free">;

const PAID_PLANS: readonly string[] = ["creator", "pro"];
const INTERVALS: readonly string[] = ["monthly", "quarterly", "annual"];

/** Narrows untrusted metadata to a real paid plan + interval, or null. Never trust a cast. */
export function parsePaidPlanSelection(
  planSlug: unknown,
  interval: unknown,
): { planId: PaidPlanId; billingInterval: BillingInterval } | null {
  if (typeof planSlug !== "string" || typeof interval !== "string") return null;
  if (!PAID_PLANS.includes(planSlug) || !INTERVALS.includes(interval)) return null;
  return { planId: planSlug as PaidPlanId, billingInterval: interval as BillingInterval };
}

/** Paystack returns `plan` as a plan-code string, a `{ plan_code }` object, or an empty object/null when no plan is attached. */
export function extractPlanCode(plan: unknown): string | null {
  if (typeof plan === "string") return plan.length > 0 ? plan : null;
  if (plan && typeof plan === "object") {
    const code = (plan as Record<string, unknown>).plan_code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}

/** True when a Paystack transaction was NOT made against a plan, i.e. it is a one-off (bank transfer) payment. */
export function isOneOffPayment(plan: unknown): boolean {
  return extractPlanCode(plan) === null;
}

export interface PaymentFacts {
  /** Minor units, as Paystack reports it. */
  amount: number | null | undefined;
  currency: string | null | undefined;
  plan: unknown;
  /** Paystack's `channel` ("card", "bank_transfer", ...). Required to be "bank_transfer" for a plan-less payment. */
  channel?: string | null;
  /** The transaction's metadata, and who/what it claims to be for -- needed to verify a bank transfer's signed quote. */
  metadata?: Record<string, unknown> | null;
  claim?: { userId: string; planId: string; billingInterval: string };
  /** Injectable clock (tests). */
  nowMs?: number;
}

export interface PaymentExpectations {
  planCode: string | null;
  /** Full price of the plan in the charge currency's minor units; null if it can't be computed. */
  expectedAmountMinor: number | null;
  chargeCurrency: string;
}

export type PaymentCheck =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      /**
       * True when the payment is verifiably OURS (valid signed quote) and was successful, but for the wrong amount:
       * the money should go back to the customer rather than sit unmatched.
       */
      refund?: boolean;
    };

/**
 * - Currency, when reported, must be the one we charge in.
 * - If the transaction carries a plan code, it must be the code for the claimed plan/interval
 *   (Paystack charges the plan's own configured amount in that case, so the amount isn't compared
 *   -- it can legitimately drift from our FX estimate).
 * - If it carries NO plan code it is a one-off payment (our bank transfer checkout; there is no
 *   recurring subscription behind it). It must have been paid by bank transfer (the only one-off
 *   channel our checkout offers), carry a valid, unexpired quote signed by our server for this
 *   user/plan/interval (transfer-quote.ts), and the amount paid must EQUAL the quoted amount, to the
 *   kobo. A wrong amount from a verifiably-ours payment comes back with `refund: true`.
 */
export function checkPaymentMatchesPlan(facts: PaymentFacts, expected: PaymentExpectations): PaymentCheck {
  if (facts.currency && facts.currency.toUpperCase() !== expected.chargeCurrency.toUpperCase()) {
    return { ok: false, reason: `unexpected currency ${facts.currency}` };
  }

  const paidPlanCode = extractPlanCode(facts.plan);
  if (paidPlanCode) {
    if (!expected.planCode) return { ok: false, reason: "no expected plan code configured" };
    if (paidPlanCode !== expected.planCode) return { ok: false, reason: "payment was for a different plan" };
    return { ok: true };
  }

  if (facts.channel !== "bank_transfer") {
    return { ok: false, reason: "a payment without a plan must be a bank transfer" };
  }
  if (!facts.currency) {
    return { ok: false, reason: "a one-off payment must report its currency" };
  }
  if (typeof facts.amount !== "number" || !Number.isFinite(facts.amount) || facts.amount <= 0) {
    return { ok: false, reason: "payment has neither a plan code nor a usable amount" };
  }
  if (!facts.claim) {
    return { ok: false, reason: "cannot verify who or what the payment was for" };
  }
  const quote = verifyTransferQuote(facts.metadata, facts.claim, facts.nowMs);
  if (!quote.ok) {
    return { ok: false, reason: `not one of our quotes: ${quote.reason}` };
  }
  if (facts.amount !== quote.amountMinor) {
    return { ok: false, reason: `amount paid (${facts.amount}) is not the amount quoted (${quote.amountMinor})`, refund: true };
  }
  return { ok: true };
}
