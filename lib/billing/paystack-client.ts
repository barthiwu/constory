// Thin, server-only REST client for the Paystack API. No SDK dependency —
// Paystack's API is a handful of plain REST calls, and this environment has
// no network path to npm-install and verify a third-party SDK against a
// live account anyway, so a minimal typed fetch wrapper is both sufficient
// and easier to audit. Never import this from client code: it reads
// PAYSTACK_SECRET_KEY, which must never reach the browser.

import crypto from "node:crypto";

const PAYSTACK_API_BASE = "https://api.paystack.co";

export class PaystackConfigError extends Error {}
export class PaystackAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PaystackAPIError";
  }
}

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackConfigError("PAYSTACK_SECRET_KEY is not configured.");
  return key;
}

export function isPaystackConfigured(): boolean {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

async function paystackRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.status === false) {
    throw new PaystackAPIError(body?.message ?? `Paystack request failed (${res.status})`, res.status);
  }
  return body as T;
}

export interface InitializeTransactionParams {
  email: string;
  /** Smallest currency unit — cents for USD (Paystack's `amount` is always an integer minor-unit value, regardless of currency). */
  amountCents: number;
  currency: "USD";
  planCode: string;
  callbackUrl: string;
  /** Validated server-side before this call is made — never derived from client input directly (spec §15-16). */
  metadata: {
    user_id: string;
    workspace_id: string | null;
    plan_slug: string;
    billing_interval: string;
    environment: string;
  };
}

export interface InitializeTransactionResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/** POST /transaction/initialize — starts a Paystack-hosted checkout; nothing is activated in Constory until it's verified (webhook or verifyTransaction). */
export async function initializeTransaction(params: InitializeTransactionParams): Promise<InitializeTransactionResult> {
  const { data } = await paystackRequest<{ data: InitializeTransactionResult }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      amount: params.amountCents,
      currency: params.currency,
      plan: params.planCode,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });
  return data;
}

export interface VerifyTransactionResult {
  status: "success" | "failed" | "abandoned" | string;
  reference: string;
  amount: number;
  currency: string;
  customer: { email: string; customer_code?: string };
  plan: string | null;
  metadata: Record<string, unknown> | null;
  authorization?: { authorization_code: string; reusable: boolean };
}

/** GET /transaction/verify/:reference — the server-authoritative check; the browser's return from checkout is never trusted on its own (spec §17, §20). */
export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const { data } = await paystackRequest<{ data: VerifyTransactionResult }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return data;
}

/**
 * Verifies a webhook payload's signature per Paystack's documented scheme:
 * HMAC-SHA512 of the raw request body, keyed with the Paystack secret key,
 * hex-encoded, compared against the `x-paystack-signature` header. `rawBody`
 * MUST be the exact bytes Paystack sent — never a re-serialized/parsed copy
 * — or this check is meaningless.
 */
export function verifyPaystackSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;

  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const gotBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== gotBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, gotBuf);
}
