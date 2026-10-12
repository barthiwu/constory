import { describe, it, expect } from "vitest";
import { buildCsp, generateNonce } from "@/lib/security/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("generateNonce", () => {
  it("is unique per call and base64", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

describe("buildCsp", () => {
  const prod = buildCsp({ nonce: "abc123", supabaseUrl: "https://proj.supabase.co" });

  it("allows scripts only from self + the request nonce, with strict-dynamic and no unsafe-inline/eval", () => {
    const script = directive(prod, "script-src");
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
  });

  it("only adds unsafe-eval in development", () => {
    expect(directive(buildCsp({ nonce: "n", isDev: true }), "script-src")).toContain("'unsafe-eval'");
    expect(directive(buildCsp({ nonce: "n", isDev: false }), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("limits network calls to self and the Supabase project (http + websocket)", () => {
    expect(directive(prod, "connect-src")).toBe("connect-src 'self' https://proj.supabase.co wss://proj.supabase.co");
  });

  it("tolerates a missing or malformed Supabase URL", () => {
    expect(directive(buildCsp({ nonce: "n" }), "connect-src")).toBe("connect-src 'self'");
    expect(directive(buildCsp({ nonce: "n", supabaseUrl: "not a url" }), "connect-src")).toBe("connect-src 'self'");
  });

  it("locks down plugins, base tag, forms and framing, and reports violations", () => {
    for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "default-src 'self'", "report-uri /api/csp-report"]) {
      expect(prod.split("; ")).toContain(d);
    }
  });
});
