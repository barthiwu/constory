import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isAuthorizedCronRequest } from "@/lib/notifications/cron-auth";

const req = (authorization?: string) => new Request("https://example.com/api/cron/x", { headers: authorization ? { authorization } : {} });

describe("isAuthorizedCronRequest", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.CRON_SECRET = original;
    vi.restoreAllMocks();
  });

  it("accepts the exact bearer secret", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorizedCronRequest(req("Bearer s3cret-value"))).toBe(true);
  });

  it("rejects wrong, partial, missing and differently-cased credentials", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorizedCronRequest(req("Bearer wrong"))).toBe(false);
    expect(isAuthorizedCronRequest(req("Bearer s3cret-valu"))).toBe(false);
    expect(isAuthorizedCronRequest(req("s3cret-value"))).toBe(false);
    expect(isAuthorizedCronRequest(req("bearer s3cret-value"))).toBe(false);
    expect(isAuthorizedCronRequest(req())).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(req("Bearer undefined"))).toBe(false);
    expect(isAuthorizedCronRequest(req("Bearer "))).toBe(false);
  });
});
