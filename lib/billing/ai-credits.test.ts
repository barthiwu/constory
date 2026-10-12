import { describe, it, expect, vi } from "vitest";
import { describeReserveFailure, reserveAiCredits } from "@/lib/billing/ai-credits";

describe("describeReserveFailure", () => {
  it("insufficient credits -> 402 with the right wording", () => {
    expect(describeReserveFailure("insufficient_credits", 4, 0)).toMatchObject({ status: 402 });
    expect(describeReserveFailure("insufficient_credits", 4, 0).error).toContain("requires 4 AI credits");
    expect(describeReserveFailure("insufficient_credits", 1, 0).error).toContain("requires 1 AI credit.");
    expect(describeReserveFailure("insufficient_credits", 4, 2).error).toContain("You have 2 remaining");
  });
  it("a read-only member gets a clear 403", () => {
    const f = describeReserveFailure("viewer_cannot_use_ai", 1, 5);
    expect(f.status).toBe(403);
    expect(f.error).toContain("view-only");
  });
  it("locked / unknown / membership failures map sensibly", () => {
    expect(describeReserveFailure("workspace_locked", 1, 0).status).toBe(402);
    expect(describeReserveFailure("not_a_member", 1, 0).status).toBe(404);
    expect(describeReserveFailure("something_else", 1, 0).status).toBe(500);
  });
});

describe("reserveAiCredits", () => {
  const client = (result: { data?: unknown; error?: unknown }) => ({ rpc: vi.fn().mockResolvedValue(result) }) as never;

  it("returns the reservation on success", async () => {
    const out = await reserveAiCredits(
      client({ data: [{ ok: true, reservation_id: "res-1", remaining: 6, monthly_allocation: 10, reason: "ok" }] }),
      "ws-1",
      "generate_ideas",
      2,
    );
    expect(out).toEqual({ ok: true, reservation: { id: "res-1", workspaceId: "ws-1", remaining: 6, allocation: 10 } });
  });

  it("suggests the next plan when credits run out", async () => {
    const out = await reserveAiCredits(
      client({ data: [{ ok: false, reservation_id: null, remaining: 0, monthly_allocation: 10, reason: "insufficient_credits" }] }),
      "ws-1",
      "generate_strategy",
      4,
      "free",
    );
    expect(out).toMatchObject({ ok: false, status: 402, upgradeTo: "creator" });
  });

  it("a viewer is refused with 403 and no upgrade nudge", async () => {
    const out = await reserveAiCredits(
      client({ data: [{ ok: false, reservation_id: null, remaining: 0, monthly_allocation: 0, reason: "viewer_cannot_use_ai" }] }),
      "ws-1",
      "generate_ideas",
      2,
      "free",
    );
    expect(out).toMatchObject({ ok: false, status: 403 });
    expect((out as { upgradeTo?: string }).upgradeTo).toBeUndefined();
  });

  it("an RPC error fails closed (no AI work happens without a hold)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await reserveAiCredits(client({ error: new Error("boom") }), "ws-1", "generate_ideas", 2);
    expect(out).toMatchObject({ ok: false, status: 500 });
    spy.mockRestore();
  });
});
