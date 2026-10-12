import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/billing/paystack-client", () => ({ createSubscription: vi.fn() }));

import { markSubscriptionCancelledByProvider } from "@/services/billing-service";

/** Minimal Supabase stand-in: a select returning `pending_plan_id`, and a recorder for updates. */
function fakeAdmin(pendingPlanId: string | null) {
  const updates: unknown[] = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { pending_plan_id: pendingPlanId }, error: null }) }) }),
      update: (payload: unknown) => {
        updates.push(payload);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
  return { client: client as never, updates };
}

describe("markSubscriptionCancelledByProvider", () => {
  it("leaves the status alone when a paid downgrade is scheduled (the disable was our own)", async () => {
    const { client, updates } = fakeAdmin("creator");
    await markSubscriptionCancelledByProvider(client, "owner-1");
    expect(updates).toEqual([]);
  });

  it("marks cancelled when the cancel is to Free", async () => {
    const { client, updates } = fakeAdmin("free");
    await markSubscriptionCancelledByProvider(client, "owner-1");
    expect(updates).toEqual([{ status: "cancelled", cancel_at_period_end: true }]);
  });

  it("marks cancelled when nothing was scheduled (cancelled from Paystack's side)", async () => {
    const { client, updates } = fakeAdmin(null);
    await markSubscriptionCancelledByProvider(client, "owner-1");
    expect(updates).toEqual([{ status: "cancelled", cancel_at_period_end: true }]);
  });
});
