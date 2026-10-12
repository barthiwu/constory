import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/billing/paystack-client", () => ({ createSubscription: vi.fn() }));

import { markSubscriptionCancelledByProvider, activatePrepaidPlanFromPayment } from "@/services/billing-service";

type Row = Record<string, unknown>;

/**
 * Minimal Supabase stand-in. `rows` answers select().eq().maybeSingle() per table; workspaces
 * answers select().eq().order(). Every update() is recorded with its table.
 */
function fakeAdmin(rows: { subscriptions?: Row | null; workspaces?: Row[] }) {
  const updates: { table: string; payload: Row }[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === "subscriptions" ? (rows.subscriptions ?? null) : null, error: null }),
          order: async () => ({ data: table === "workspaces" ? (rows.workspaces ?? []) : [], error: null }),
        }),
      }),
      update: (payload: Row) => {
        updates.push({ table, payload });
        return { eq: async () => ({ error: null }), in: async () => ({ error: null }) };
      },
    }),
  };
  return { client: client as never, updates };
}

describe("markSubscriptionCancelledByProvider", () => {
  it("leaves the status alone when a paid downgrade is scheduled (the disable was our own)", async () => {
    const { client, updates } = fakeAdmin({ subscriptions: { pending_plan_id: "creator", renewal_mode: "auto" } });
    await markSubscriptionCancelledByProvider(client, "owner-1");
    expect(updates).toEqual([]);
  });

  it("leaves a prepaid (bank transfer) plan alone -- the disable was the card subscription it replaced", async () => {
    const { client, updates } = fakeAdmin({ subscriptions: { pending_plan_id: "free", renewal_mode: "manual" } });
    await markSubscriptionCancelledByProvider(client, "owner-1");
    expect(updates).toEqual([]);
  });

  it("marks cancelled when the cancel is to Free", async () => {
    const { client, updates } = fakeAdmin({ subscriptions: { pending_plan_id: "free", renewal_mode: "auto" } });
    await markSubscriptionCancelledByProvider(client, "owner-1");
    expect(updates).toEqual([{ table: "subscriptions", payload: { status: "cancelled", cancel_at_period_end: true } }]);
  });

  it("marks cancelled when nothing was scheduled (cancelled from Paystack's side)", async () => {
    const { client, updates } = fakeAdmin({ subscriptions: { pending_plan_id: null, renewal_mode: "auto" } });
    await markSubscriptionCancelledByProvider(client, "owner-1");
    expect(updates).toEqual([{ table: "subscriptions", payload: { status: "cancelled", cancel_at_period_end: true } }]);
  });
});

describe("activatePrepaidPlanFromPayment", () => {
  const now = new Date("2026-10-12T10:00:00Z");

  it("starts a fresh prepaid period, schedules the drop to Free, clears card tokens and resets credits", async () => {
    const { client, updates } = fakeAdmin({
      subscriptions: { plan_id: "free", renewal_mode: "auto", current_period_start: "2026-09-01T00:00:00Z", current_period_end: "2026-10-01T00:00:00Z" },
    });
    const result = await activatePrepaidPlanFromPayment(client, "owner-1", "pro", "quarterly", { customerCode: "CUS_1" }, now);

    expect(result.extended).toBe(false);
    expect(result.periodEnd).toBe("2027-01-12T10:00:00.000Z");

    const sub = updates.find((u) => u.table === "subscriptions")!.payload;
    expect(sub).toMatchObject({
      plan_id: "pro",
      status: "active",
      billing_interval: "quarterly",
      current_period_start: "2026-10-12T10:00:00.000Z",
      current_period_end: "2027-01-12T10:00:00.000Z",
      cancel_at_period_end: true,
      pending_plan_id: "free",
      renewal_mode: "manual",
      provider_subscription_id: null,
      provider_subscription_token: null,
      provider_authorization_code: null,
      provider_customer_id: "CUS_1",
    });

    const credits = updates.find((u) => u.table === "credit_balances")!.payload;
    expect(credits).toMatchObject({ monthly_allocation: 260, credits_used: 0 });
  });

  it("extends a still-running prepaid plan of the same tier from its current end, without resetting credits", async () => {
    const { client, updates } = fakeAdmin({
      subscriptions: { plan_id: "creator", renewal_mode: "manual", current_period_start: "2026-10-01T00:00:00Z", current_period_end: "2026-11-01T00:00:00Z" },
    });
    const result = await activatePrepaidPlanFromPayment(client, "owner-1", "creator", "monthly", {}, now);

    expect(result.extended).toBe(true);
    expect(result.periodEnd).toBe("2026-12-01T00:00:00.000Z");
    const sub = updates.find((u) => u.table === "subscriptions")!.payload;
    expect(sub.current_period_start).toBe("2026-10-01T00:00:00.000Z");
    expect(updates.some((u) => u.table === "credit_balances")).toBe(false);
  });

  it("does not extend a lapsed prepaid plan -- it starts fresh from now", async () => {
    const { client } = fakeAdmin({
      subscriptions: { plan_id: "creator", renewal_mode: "manual", current_period_start: "2026-08-01T00:00:00Z", current_period_end: "2026-09-01T00:00:00Z" },
    });
    const result = await activatePrepaidPlanFromPayment(client, "owner-1", "creator", "monthly", {}, now);
    expect(result.extended).toBe(false);
    expect(result.periodEnd).toBe("2026-11-12T10:00:00.000Z");
  });

  it("an upgrade (different tier) starts a fresh period even while a prepaid plan is running", async () => {
    const { client } = fakeAdmin({
      subscriptions: { plan_id: "creator", renewal_mode: "manual", current_period_start: "2026-10-01T00:00:00Z", current_period_end: "2026-11-01T00:00:00Z" },
    });
    const result = await activatePrepaidPlanFromPayment(client, "owner-1", "pro", "monthly", {}, now);
    expect(result.extended).toBe(false);
    expect(result.periodEnd).toBe("2026-11-12T10:00:00.000Z");
  });

  it("does not treat a card subscription as extendable", async () => {
    const { client } = fakeAdmin({
      subscriptions: { plan_id: "creator", renewal_mode: "auto", current_period_start: "2026-10-01T00:00:00Z", current_period_end: "2026-11-01T00:00:00Z" },
    });
    const result = await activatePrepaidPlanFromPayment(client, "owner-1", "creator", "monthly", {}, now);
    expect(result.extended).toBe(false);
  });
});
