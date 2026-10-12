import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/server";

type DB = SupabaseClient<Database>;

/**
 * Thin wrapper over the `check_rate_limit` Postgres function (migration 0027).
 * Serverless functions share no memory, so an in-process counter would be
 * useless; the limit has to live in the database. Pass the ADMIN client -- the
 * function is service-role only.
 *
 * Fails OPEN on a database error: a limiter outage must not take support chat
 * or AI generation offline (AI is separately gated by credits, support chat by
 * the per-chat cap), but the failure is logged loudly.
 */
export async function withinRateLimit(admin: DB, bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data !== false;
  } catch (err) {
    console.error(`[rate-limit] check failed for bucket "${bucket.split(":")[0]}", failing open:`, err);
    return true;
  }
}

/**
 * Best-effort client IP from the proxy headers. Spoofable if the app is ever
 * served without a trusted proxy in front (Vercel overwrites these), so treat
 * it as one layer among several (per-chat and global caps back it up).
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Hash identifiers before storing them as bucket keys so raw IPs are never persisted. */
export function hashKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Convenience for route handlers: builds the admin client itself and fails open if it can't
 * (e.g. SUPABASE_SECRET_KEY unset in a dev environment), so a missing secret never turns into a 500
 * on every request.
 */
export async function withinRateLimitFor(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    return await withinRateLimit(createAdminClient(), bucket, max, windowSeconds);
  } catch (err) {
    console.error("[rate-limit] could not create the admin client, failing open:", err);
    return true;
  }
}
