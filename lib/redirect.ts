/**
 * Server-side validation for post-login redirect targets.
 *
 * Only a same-origin, in-app path under /app is ever considered safe. Everything
 * else (absolute URLs, protocol-relative URLs like "//evil.com", backslash tricks,
 * whitespace/control characters, or paths outside the authenticated app area) is
 * rejected in favor of the fallback. This is the server-side gate that actually
 * decides where a login redirects to — never trust a `redirectTo` value from the
 * client/query string without running it through this first.
 */

const SAFE_PATH_CHARS = /^[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/;
const DEFAULT_FALLBACK = "/app/dashboard";

export function getSafeRedirectPath(
  candidate: string | null | undefined,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (!candidate || typeof candidate !== "string") return fallback;
  const value = candidate.trim();

  if (value.length === 0 || value.length > 2048) return fallback;

  // Must start with a single "/" — never "//" or "/\" (browsers can treat both as
  // protocol-relative, i.e. an open redirect to a different origin).
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;

  // Reject any embedded scheme (e.g. "/redirect?to=https://evil.com" style tricks
  // are fine to keep as a query value, but the path itself must never contain "://").
  if (value.includes("://")) return fallback;

  // Restrict to a safe character set — no control characters, no backslashes.
  if (!SAFE_PATH_CHARS.test(value)) return fallback;

  // Only allow redirecting back into the authenticated app area.
  if (!/^\/app(\/|$|\?)/.test(value)) return fallback;

  return value;
}
