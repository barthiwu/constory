import { describe, it, expect, beforeEach } from "vitest";
import { createTransferQuote } from "@/lib/billing/transfer-quote";
import { checkPaymentMatchesPlan, extractPlanCode, isOneOffPayment, parsePaidPlanSelection } from "@/lib/billing/payment-guard";

const expected = { planCode: "PLN_pro_monthly", expectedAmountMinor: 3_500_000, chargeCurrency: "NGN" };

describe("parsePaidPlanSelection", () => {
  it("accepts real paid plans and intervals", () => {
    expect(parsePaidPlanSelection("pro", "monthly")).toEqual({ planId: "pro", billingInterval: "monthly" });
    expect(parsePaidPlanSelection("creator", "annual")).toEqual({ planId: "creator", billingInterval: "annual" });
  });
  it("rejects free, unknown and non-string values", () => {
    expect(parsePaidPlanSelection("free", "monthly")).toBeNull();
    expect(parsePaidPlanSelection("enterprise", "monthly")).toBeNull();
    expect(parsePaidPlanSelection("pro", "weekly")).toBeNull();
    expect(parsePaidPlanSelection({ toString: () => "pro" }, "monthly")).toBeNull();
    expect(parsePaidPlanSelection(undefined, undefined)).toBeNull();
  });
});

describe("extractPlanCode", () => {
  it("handles string, object, and empty shapes", () => {
    expect(extractPlanCode("PLN_x")).toBe("PLN_x");
    expect(extractPlanCode({ plan_code: "PLN_y", name: "n" })).toBe("PLN_y");
    expect(extractPlanCode({})).toBeNull();
    expect(extractPlanCode(null)).toBeNull();
    expect(extractPlanCode("")).toBeNull();
  });
});

describe("checkPaymentMatchesPlan", () => {
  it("accepts a payment carrying the expected plan code", () => {
    expect(checkPaymentMatchesPlan({ amount: 3_400_000, currency: "NGN", plan: { plan_code: "PLN_pro_monthly" } }, expected).ok).toBe(true);
    expect(checkPaymentMatchesPlan({ amount: 1, currency: "NGN", plan: "PLN_pro_monthly" }, expected).ok).toBe(true);
  });

  it("rejects a payment for a different (cheaper) plan code", () => {
    const r = checkPaymentMatchesPlan({ amount: 1_000_000, currency: "NGN", plan: { plan_code: "PLN_creator_monthly" } }, expected);
    expect(r.ok).toBe(false);
  });

  it("rejects a tiny one-off charge claiming to be Pro (metadata spoofing)", () => {
    expect(checkPaymentMatchesPlan({ amount: 10_000, currency: "NGN", plan: {}, channel: "bank_transfer" }, expected).ok).toBe(false);
    expect(checkPaymentMatchesPlan({ amount: 10_000, currency: "NGN", plan: null, channel: "bank_transfer" }, expected).ok).toBe(false);
  });

  describe("plan-less bank transfer (signed quote, exact amount)", () => {
    const NOW = 1_800_000_000_000;
    const claim = { userId: "u1", planId: "pro", billingInterval: "monthly" };
    const quote = () => ({ ...createTransferQuote({ ...claim, amountMinor: 2_240_500 }, NOW), user_id: "u1" });
    const facts = (over: Record<string, unknown> = {}) => ({
      amount: 2_240_500,
      currency: "NGN",
      plan: null,
      channel: "bank_transfer",
      metadata: quote(),
      claim,
      nowMs: NOW + 60_000,
      ...over,
    });

    beforeEach(() => {
      process.env.PAYSTACK_SECRET_KEY = "sk_test_quote_key";
    });

    it("accepts exactly the quoted amount", () => {
      expect(checkPaymentMatchesPlan(facts(), expected).ok).toBe(true);
    });

    it("rejects 5 naira short and asks for a refund (₦22,405 quoted, ₦22,400 sent)", () => {
      const r = checkPaymentMatchesPlan(facts({ amount: 2_240_000 }), expected);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.refund).toBe(true);
    });

    it("rejects an overpayment and asks for a refund", () => {
      const r = checkPaymentMatchesPlan(facts({ amount: 2_240_600 }), expected);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.refund).toBe(true);
    });

    it("rejects, WITHOUT a refund, a payment that is not one of our quotes", () => {
      for (const metadata of [null, {}, { quote_amount: 2_240_500, quote_issued_at: NOW, quote_sig: "0".repeat(64) }, { ...quote(), quote_sig: "zz" }]) {
        const r = checkPaymentMatchesPlan(facts({ metadata }), expected);
        expect(r.ok).toBe(false);
        expect(!r.ok && r.refund).toBeFalsy();
      }
    });

    it("a forged cheaper quote cannot be signed without the server secret", () => {
      const cheap = { quote_amount: 100, quote_issued_at: NOW, quote_sig: quote().quote_sig };
      const r = checkPaymentMatchesPlan(facts({ amount: 100, metadata: cheap }), expected);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.refund).toBeFalsy();
    });

    it("a quote for one plan/user can't be replayed for another", () => {
      expect(checkPaymentMatchesPlan(facts({ claim: { ...claim, planId: "creator" } }), expected).ok).toBe(false);
      expect(checkPaymentMatchesPlan(facts({ claim: { ...claim, userId: "someone-else" } }), expected).ok).toBe(false);
      expect(checkPaymentMatchesPlan(facts({ claim: { ...claim, billingInterval: "annual" } }), expected).ok).toBe(false);
    });

    it("rejects an expired quote", () => {
      expect(checkPaymentMatchesPlan(facts({ nowMs: NOW + 25 * 60 * 60 * 1000 }), expected).ok).toBe(false);
    });

    it("rejects any channel other than bank_transfer, a missing currency, and a missing claim", () => {
      expect(checkPaymentMatchesPlan(facts({ channel: "card" }), expected).ok).toBe(false);
      expect(checkPaymentMatchesPlan(facts({ channel: null }), expected).ok).toBe(false);
      expect(checkPaymentMatchesPlan(facts({ currency: null }), expected).ok).toBe(false);
      expect(checkPaymentMatchesPlan(facts({ claim: undefined }), expected).ok).toBe(false);
    });

    it("rejects an unusable amount", () => {
      expect(checkPaymentMatchesPlan(facts({ amount: null }), expected).ok).toBe(false);
      expect(checkPaymentMatchesPlan(facts({ amount: 0 }), expected).ok).toBe(false);
    });
  });

  it("rejects the wrong currency", () => {
    expect(checkPaymentMatchesPlan({ amount: 3_500_000, currency: "GHS", plan: { plan_code: "PLN_pro_monthly" } }, expected).ok).toBe(false);
  });

  it("rejects when nothing can be verified", () => {
    expect(checkPaymentMatchesPlan({ amount: null, currency: "NGN", plan: null, channel: "bank_transfer" }, expected).ok).toBe(false);
    expect(checkPaymentMatchesPlan({ amount: 0, currency: "NGN", plan: null, channel: "bank_transfer" }, expected).ok).toBe(false);
  });
});

describe("isOneOffPayment", () => {
  it("is true only when there is no plan code", () => {
    expect(isOneOffPayment(null)).toBe(true);
    expect(isOneOffPayment({})).toBe(true);
    expect(isOneOffPayment("PLN_x")).toBe(false);
    expect(isOneOffPayment({ plan_code: "PLN_x" })).toBe(false);
  });
});
