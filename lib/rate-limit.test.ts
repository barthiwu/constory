import { describe, it, expect, vi } from "vitest";
import { clientIpFrom, hashKey, withinRateLimit } from "@/lib/rate-limit";

describe("clientIpFrom", () => {
  it("uses the first hop of x-forwarded-for", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("falls back to x-real-ip then 'unknown'", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});

describe("hashKey", () => {
  it("is stable, fixed-length and hides the input", () => {
    expect(hashKey("203.0.113.7")).toBe(hashKey("203.0.113.7"));
    expect(hashKey("203.0.113.7")).toHaveLength(32);
    expect(hashKey("203.0.113.7")).not.toContain("203");
    expect(hashKey("a")).not.toBe(hashKey("b"));
  });
});

describe("withinRateLimit", () => {
  const fake = (result: { data?: unknown; error?: unknown }) => ({ rpc: vi.fn().mockResolvedValue(result) }) as never;

  it("passes through the database verdict", async () => {
    expect(await withinRateLimit(fake({ data: true }), "b", 5, 60)).toBe(true);
    expect(await withinRateLimit(fake({ data: false }), "b", 5, 60)).toBe(false);
  });
  it("fails open (and logs) when the limiter itself errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await withinRateLimit(fake({ error: new Error("db down") }), "b", 5, 60)).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
