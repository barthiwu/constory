import { describe, it, expect } from "vitest";
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

  it("accepts a plan-less (bank transfer) charge that covers the price within FX tolerance", () => {
    expect(checkPaymentMatchesPlan({ amount: 3_500_000, currency: "NGN", plan: null, channel: "bank_transfer" }, expected).ok).toBe(true);
    expect(checkPaymentMatchesPlan({ amount: 3_340_000, currency: "NGN", plan: null, channel: "bank_transfer" }, expected).ok).toBe(true); // 95.4%
  });

  it("rejects a plan-less charge that is more than 5% short (e.g. paid for Creator, claiming Pro)", () => {
    expect(checkPaymentMatchesPlan({ amount: 3_000_000, currency: "NGN", plan: null, channel: "bank_transfer" }, expected).ok).toBe(false);
    expect(checkPaymentMatchesPlan({ amount: 1_800_000, currency: "NGN", plan: null, channel: "bank_transfer" }, expected).ok).toBe(false);
  });

  it("rejects a plan-less payment made on any channel other than bank transfer", () => {
    expect(checkPaymentMatchesPlan({ amount: 3_500_000, currency: "NGN", plan: null, channel: "card" }, expected).ok).toBe(false);
    expect(checkPaymentMatchesPlan({ amount: 3_500_000, currency: "NGN", plan: null }, expected).ok).toBe(false);
  });

  it("requires a one-off payment to report its currency", () => {
    expect(checkPaymentMatchesPlan({ amount: 3_500_000, currency: null, plan: null, channel: "bank_transfer" }, expected).ok).toBe(false);
  });

  it("rejects the wrong currency", () => {
    expect(checkPaymentMatchesPlan({ amount: 3_500_000, currency: "GHS", plan: { plan_code: "PLN_pro_monthly" } }, expected).ok).toBe(false);
  });

  it("rejects when nothing can be verified", () => {
    expect(checkPaymentMatchesPlan({ amount: null, currency: "NGN", plan: null, channel: "bank_transfer" }, expected).ok).toBe(false);
    expect(checkPaymentMatchesPlan({ amount: 0, currency: "NGN", plan: null, channel: "bank_transfer" }, expected).ok).toBe(false);
    expect(checkPaymentMatchesPlan({ amount: 5_000_000, currency: "NGN", plan: null, channel: "bank_transfer" }, { ...expected, expectedAmountMinor: null }).ok).toBe(false);
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
