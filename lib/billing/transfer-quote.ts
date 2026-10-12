// A bank transfer is a one-off payment, so unlike a plan-code checkout nothing on Paystack's side says what it
// was FOR or how much it should have been. We make our own quote tamper-proof instead: when checkout starts we
// sign (user, plan, interval, amount, issued-at) with a server secret and put the signature in the transaction's
// metadata. When the payment comes back we recompute the signature from the transaction's own fields. A payment
// is only accepted if (a) the signature is ours, (b) it is recent, and (c) the amount paid is EXACTLY the amount
// we quoted. Metadata alone is attacker-influenceable (anyone with the public key can initialize a transaction
// with any metadata); an HMAC over the amount is not.

import crypto from "node:crypto";

/** How long a quote can be paid after it was issued. A Paystack transfer account lives for well under an hour. */
export const QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface QuoteFields {
  userId: string;
  planId: string;
  billingInterval: string;
  amountMinor: number;
  issuedAtMs: number;
}

export interface QuoteMetadata {
  quote_amount: number;
  quote_issued_at: number;
  quote_sig: string;
}

function secret(): string | null {
  return process.env.PAYSTACK_SECRET_KEY || null;
}

function sign(f: QuoteFields, key: string): string {
  const payload = ["constory-transfer-quote-v1", f.userId, f.planId, f.billingInterval, f.amountMinor, f.issuedAtMs].join("|");
  return crypto.createHmac("sha256", key).update(payload).digest("hex");
}

/** Metadata to attach when initializing the transfer transaction. Throws if no secret is configured. */
export function createTransferQuote(f: Omit<QuoteFields, "issuedAtMs">, nowMs: number = Date.now()): QuoteMetadata {
  const key = secret();
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  const full = { ...f, issuedAtMs: nowMs };
  return { quote_amount: f.amountMinor, quote_issued_at: nowMs, quote_sig: sign(full, key) };
}

export type QuoteCheck = { ok: true; amountMinor: number } | { ok: false; reason: string };

/** Verifies a quote found in transaction metadata for the claimed (user, plan, interval). Does NOT compare the amount paid. */
export function verifyTransferQuote(
  metadata: Record<string, unknown> | null | undefined,
  claim: { userId: string; planId: string; billingInterval: string },
  nowMs: number = Date.now(),
): QuoteCheck {
  const key = secret();
  if (!key) return { ok: false, reason: "no signing key configured" };
  const amount = metadata?.quote_amount;
  const issuedAt = metadata?.quote_issued_at;
  const sig = metadata?.quote_sig;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "missing or invalid quote amount" };
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) return { ok: false, reason: "missing quote time" };
  if (typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig)) return { ok: false, reason: "missing quote signature" };

  const expected = sign({ ...claim, amountMinor: amount, issuedAtMs: issuedAt }, key);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "quote signature does not match" };

  const age = nowMs - issuedAt;
  if (age < -CLOCK_SKEW_MS) return { ok: false, reason: "quote is from the future" };
  if (age > QUOTE_MAX_AGE_MS) return { ok: false, reason: "quote has expired" };
  return { ok: true, amountMinor: amount };
}
