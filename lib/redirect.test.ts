import { describe, it, expect } from "vitest";
import { getSafeRedirectPath, getSafeConfirmNextPath } from "@/lib/redirect";

describe("getSafeRedirectPath", () => {
  it("allows a plain internal /app path", () => {
    expect(getSafeRedirectPath("/app/dashboard")).toBe("/app/dashboard");
    expect(getSafeRedirectPath("/app/calendar")).toBe("/app/calendar");
    expect(getSafeRedirectPath("/app/ideas")).toBe("/app/ideas");
  });

  it("allows an /app path with a nested segment and query string", () => {
    expect(getSafeRedirectPath("/app/calendars/abc123")).toBe("/app/calendars/abc123");
    expect(getSafeRedirectPath("/app/calendars/abc123?tab=posts")).toBe("/app/calendars/abc123?tab=posts");
  });

  it("falls back to /app/dashboard when no redirect target is given", () => {
    expect(getSafeRedirectPath(null)).toBe("/app/dashboard");
    expect(getSafeRedirectPath(undefined)).toBe("/app/dashboard");
    expect(getSafeRedirectPath("")).toBe("/app/dashboard");
  });

  it("rejects absolute URLs to another origin (open redirect)", () => {
    expect(getSafeRedirectPath("https://malicious-site.com")).toBe("/app/dashboard");
    expect(getSafeRedirectPath("http://malicious-site.com/app/dashboard")).toBe("/app/dashboard");
    expect(getSafeRedirectPath("https://malicious-site.com/app/dashboard")).toBe("/app/dashboard");
  });

  it("rejects protocol-relative URLs (open redirect)", () => {
    expect(getSafeRedirectPath("//malicious-site.com")).toBe("/app/dashboard");
    expect(getSafeRedirectPath("//malicious-site.com/app/dashboard")).toBe("/app/dashboard");
  });

  it("rejects backslash tricks some browsers normalize into protocol-relative URLs", () => {
    expect(getSafeRedirectPath("/\\malicious-site.com")).toBe("/app/dashboard");
    expect(getSafeRedirectPath("\\\\malicious-site.com")).toBe("/app/dashboard");
  });

  it("rejects paths outside the authenticated app area", () => {
    expect(getSafeRedirectPath("/login")).toBe("/app/dashboard");
    expect(getSafeRedirectPath("/")).toBe("/app/dashboard");
    expect(getSafeRedirectPath("/settings")).toBe("/app/dashboard");
  });

  it("rejects a value that doesn't start with a single slash", () => {
    expect(getSafeRedirectPath("app/dashboard")).toBe("/app/dashboard");
    expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/app/dashboard");
  });

  it("respects a custom fallback", () => {
    expect(getSafeRedirectPath("https://evil.example", "/app/ideas")).toBe("/app/ideas");
  });

  it("rejects embedded control characters", () => {
    expect(getSafeRedirectPath("/app/dashboard\n\rSet-Cookie: x=1")).toBe("/app/dashboard");
  });
});

describe("getSafeConfirmNextPath (/auth/confirm open-redirect guard)", () => {
  const FALLBACK = "/reset-password";

  it("allows the in-app destinations the app itself puts in email links", () => {
    expect(getSafeConfirmNextPath("/reset-password")).toBe("/reset-password");
    expect(getSafeConfirmNextPath("/app/dashboard")).toBe("/app/dashboard");
    expect(getSafeConfirmNextPath("/app/calendars/abc?tab=posts")).toBe("/app/calendars/abc?tab=posts");
    expect(getSafeConfirmNextPath("/invite/3f2b8c1e-aaaa-bbbb-cccc-1234567890ab")).toBe("/invite/3f2b8c1e-aaaa-bbbb-cccc-1234567890ab");
  });

  it("falls back when next is missing", () => {
    expect(getSafeConfirmNextPath(null)).toBe(FALLBACK);
    expect(getSafeConfirmNextPath(undefined)).toBe(FALLBACK);
    expect(getSafeConfirmNextPath("")).toBe(FALLBACK);
  });

  it("rejects the userinfo / lookalike-host tricks that `${origin}${next}` is vulnerable to", () => {
    // https://constory.app + "@evil.com" -> https://constory.app@evil.com (lands on evil.com)
    expect(getSafeConfirmNextPath("@evil.com")).toBe(FALLBACK);
    // https://constory.app + ".evil.com" -> https://constory.app.evil.com
    expect(getSafeConfirmNextPath(".evil.com")).toBe(FALLBACK);
    expect(getSafeConfirmNextPath(":8080@evil.com")).toBe(FALLBACK);
  });

  it("rejects absolute, protocol-relative and backslash URLs", () => {
    expect(getSafeConfirmNextPath("https://evil.com")).toBe(FALLBACK);
    expect(getSafeConfirmNextPath("//evil.com")).toBe(FALLBACK);
    expect(getSafeConfirmNextPath("/\\evil.com")).toBe(FALLBACK);
  });

  it("rejects in-app but non-allowlisted paths", () => {
    expect(getSafeConfirmNextPath("/login")).toBe(FALLBACK);
    expect(getSafeConfirmNextPath("/api/webhooks/paystack")).toBe(FALLBACK);
    expect(getSafeConfirmNextPath("/reset-password-evil")).toBe(FALLBACK);
    expect(getSafeConfirmNextPath("/invite/x")).toBe(FALLBACK);
  });

  it("every accepted value resolves to the trusted origin (never another host)", () => {
    const origin = "https://constory.app";
    for (const candidate of ["@evil.com", ".evil.com", "https://evil.com", "//evil.com", "/app/dashboard", "/reset-password"]) {
      expect(new URL(getSafeConfirmNextPath(candidate), origin).origin).toBe(origin);
    }
  });
});
