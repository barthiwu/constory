import type { NextConfig } from "next";

/**
 * Baseline security headers for every response. Deliberately NOT a full script-src CSP: Next.js
 * injects inline bootstrap scripts, and a nonce-based CSP needs per-request plumbing that's better
 * added (and tested) as its own change. These cover the cheap, high-value cases: clickjacking,
 * MIME sniffing, protocol downgrade, referrer leakage, base-tag / form-action hijacking.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework/version to scanners.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
