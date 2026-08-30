import { describe, it, expect } from "vitest";
import { getSafeRedirectPath } from "@/lib/redirect";

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
