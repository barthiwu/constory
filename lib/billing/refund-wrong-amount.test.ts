import { describe, it, expect, vi, beforeEach } from "vitest";

const createRefund = vi.fn();
const recordBillingEvent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/billing/paystack-client", () => ({
  createRefund: (...a: unknown[]) => createRefund(...a),
  initializeTransaction: vi.fn(),
  verifyTransaction: vi.fn(),
  verifyPaystackSignature: vi.fn(),
  disableSubscription: vi.fn(),
  createSubscription: vi.fn(),
  PaystackAPIError: class extends Error {},
}));
vi.mock("@/services/billing-service", () => ({
  applyPlanChange: vi.fn(),
  cancelSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
  scheduleDowngrade: vi.fn(),
  lockExcessWorkspaces: vi.fn(),
  getSubscriptionAdmin: vi.fn(),
  activatePaidPlanFromPayment: vi.fn(),
  activatePrepaidPlanFromPayment: vi.fn(),
  releaseBillingEvent: vi.fn(),
  recordBillingEvent: (...a: unknown[]) => recordBillingEvent(...a),
}));

import { refundWrongAmountPayment } from "@/lib/billing/paystack-provider";

describe("refundWrongAmountPayment", () => {
  beforeEach(() => {
    createRefund.mockReset();
    recordBillingEvent.mockReset();
  });

  it("asks Paystack for a full refund of the reference, once", async () => {
    recordBillingEvent.mockResolvedValue({ alreadyProcessed: false });
    createRefund.mockResolvedValue({ status: "pending" });
    const r = await refundWrongAmountPayment({} as never, { ownerId: "u1", reference: "ref_1", detail: "short by 5" });
    expect(r).toEqual({ started: true, alreadyRequested: false });
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(createRefund.mock.calls[0][0]).toBe("ref_1");
    expect(recordBillingEvent.mock.calls[0][1].providerEventId).toBe("paystack_refund:ref_1");
  });

  it("does not refund twice (webhook + page reload)", async () => {
    recordBillingEvent.mockResolvedValue({ alreadyProcessed: true });
    const r = await refundWrongAmountPayment({} as never, { ownerId: "u1", reference: "ref_1", detail: "x" });
    expect(r).toEqual({ started: true, alreadyRequested: true });
    expect(createRefund).not.toHaveBeenCalled();
  });

  it("records an error event for the operator when Paystack refuses, and reports started: false", async () => {
    recordBillingEvent.mockResolvedValue({ alreadyProcessed: false });
    createRefund.mockRejectedValue(new Error("Transaction not refundable"));
    const r = await refundWrongAmountPayment({} as never, { ownerId: "u1", reference: "ref_2", detail: "x" });
    expect(r.started).toBe(false);
    const errorEvent = recordBillingEvent.mock.calls.map((c) => c[1]).find((e) => e.status === "error");
    expect(errorEvent.detail).toContain("refund it manually");
    expect(errorEvent.detail).toContain("ref_2");
  });
});
