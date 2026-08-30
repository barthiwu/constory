import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ENV_VAR_BY_PLAN in lib/billing/paystack-plan-codes.ts is built from
// process.env at module-import time (spec v1.1 §12: codes must be
// centrally configured, not hard-coded), so each test that varies which env
// vars are set needs its own fresh module instance — vi.resetModules() plus
// a dynamic import, rather than a single top-level import.

const ORIGINAL_ENV = { ...process.env };
const ALL_PLAN_CODE_VARS = [
  "PAYSTACK_PLAN_CODE_CREATOR_MONTHLY",
  "PAYSTACK_PLAN_CODE_CREATOR_QUARTERLY",
  "PAYSTACK_PLAN_CODE_CREATOR_ANNUAL",
  "PAYSTACK_PLAN_CODE_PRO_MONTHLY",
  "PAYSTACK_PLAN_CODE_PRO_QUARTERLY",
  "PAYSTACK_PLAN_CODE_PRO_ANNUAL",
] as const;

beforeEach(() => {
  vi.resetModules();
  for (const key of ALL_PLAN_CODE_VARS) delete process.env[key];
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getPaystackPlanCode / paystackPlanCodesConfigured", () => {
  it("throws PaystackPlanCodeMissingError when nothing is configured", async () => {
    const { getPaystackPlanCode, PaystackPlanCodeMissingError } = await import("@/lib/billing/paystack-plan-codes");
    expect(() => getPaystackPlanCode("creator", "monthly")).toThrow(PaystackPlanCodeMissingError);
  });

  it("reports not configured when only some codes are set", async () => {
    process.env.PAYSTACK_PLAN_CODE_CREATOR_MONTHLY = "PLN_creator_monthly";
    const { paystackPlanCodesConfigured } = await import("@/lib/billing/paystack-plan-codes");
    expect(paystackPlanCodesConfigured()).toBe(false);
  });

  it("returns the configured code for a (plan, interval) pair, and never falls back to a guess for another pair", async () => {
    process.env.PAYSTACK_PLAN_CODE_CREATOR_MONTHLY = "PLN_creator_monthly";
    const { getPaystackPlanCode, PaystackPlanCodeMissingError } = await import("@/lib/billing/paystack-plan-codes");

    expect(getPaystackPlanCode("creator", "monthly")).toBe("PLN_creator_monthly");
    expect(() => getPaystackPlanCode("creator", "annual")).toThrow(PaystackPlanCodeMissingError);
  });

  it("is configured once every paid (plan, interval) pair has a code", async () => {
    for (const key of ALL_PLAN_CODE_VARS) process.env[key] = `PLN_${key.toLowerCase()}`;
    const { paystackPlanCodesConfigured, getPaystackPlanCode } = await import("@/lib/billing/paystack-plan-codes");

    expect(paystackPlanCodesConfigured()).toBe(true);
    expect(getPaystackPlanCode("pro", "annual")).toBe("PLN_paystack_plan_code_pro_annual");
  });
});
