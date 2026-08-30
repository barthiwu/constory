import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { verifyPaystackSignature, isPaystackConfigured } from "@/lib/billing/paystack-client";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("verifyPaystackSignature (spec §37 — HMAC-SHA512 of the raw body)", () => {
  beforeEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_WEBHOOK_SECRET;
  });

  it("accepts a signature computed the same way Paystack documents", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
    const rawBody = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    const signature = crypto.createHmac("sha512", "sk_test_abc123").update(rawBody).digest("hex");

    expect(verifyPaystackSignature(rawBody, signature)).toBe(true);
  });

  it("prefers PAYSTACK_WEBHOOK_SECRET over PAYSTACK_SECRET_KEY when both are set", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
    process.env.PAYSTACK_WEBHOOK_SECRET = "whsec_different";
    const rawBody = "{}";
    const signedWithWebhookSecret = crypto.createHmac("sha512", "whsec_different").update(rawBody).digest("hex");
    const signedWithSecretKey = crypto.createHmac("sha512", "sk_test_abc123").update(rawBody).digest("hex");

    expect(verifyPaystackSignature(rawBody, signedWithWebhookSecret)).toBe(true);
    expect(verifyPaystackSignature(rawBody, signedWithSecretKey)).toBe(false);
  });

  it("rejects a tampered body", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
    const signature = crypto.createHmac("sha512", "sk_test_abc123").update("original body").digest("hex");

    expect(verifyPaystackSignature("tampered body", signature)).toBe(false);
  });

  it("rejects a signature signed with the wrong secret", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
    const rawBody = "{}";
    const wrongSignature = crypto.createHmac("sha512", "someone-elses-secret").update(rawBody).digest("hex");

    expect(verifyPaystackSignature(rawBody, wrongSignature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
    expect(verifyPaystackSignature("{}", null)).toBe(false);
  });

  it("rejects when no secret is configured at all — never treats an unconfigured environment as trusted", () => {
    expect(verifyPaystackSignature("{}", "anything")).toBe(false);
  });

  it("rejects a same-length but different signature (exercises the timingSafeEqual path)", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
    const rawBody = "{}";
    const real = crypto.createHmac("sha512", "sk_test_abc123").update(rawBody).digest("hex");
    const sameLengthWrong = "0".repeat(real.length);

    expect(verifyPaystackSignature(rawBody, sameLengthWrong)).toBe(false);
  });
});

describe("isPaystackConfigured", () => {
  it("is false with no secret key set", () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(isPaystackConfigured()).toBe(false);
  });

  it("is true once a secret key is set", () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_abc123";
    expect(isPaystackConfigured()).toBe(true);
  });
});
