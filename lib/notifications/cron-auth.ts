import crypto from "crypto";

/**
 * Verifies a cron-triggered route handler's request. Vercel Cron
 * automatically sends `Authorization: Bearer $CRON_SECRET` on every
 * scheduled invocation once the CRON_SECRET environment variable is set
 * (see vercel.json's `crons` entries pointing at these routes) — this
 * rejects anything else, so a reminder/digest route can't be triggered by
 * an arbitrary request to its public URL. If a different host ends up
 * running the cron schedule (see the deployment note), it needs to send
 * the same header.
 *
 * The comparison is constant-time (hashing both sides to fixed length first
 * so differing lengths don't leak through timingSafeEqual's length check) so
 * the secret can't be recovered byte-by-byte from response timing.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured — refuse rather than silently running
    // unprotected in an environment where anyone could hit the route.
    console.error("[cron] CRON_SECRET is not set — refusing all cron requests.");
    return false;
  }
  const header = request.headers.get("authorization");
  if (!header) return false;

  const expected = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
  const got = crypto.createHash("sha256").update(header).digest();
  return crypto.timingSafeEqual(expected, got);
}
