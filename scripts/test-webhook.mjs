// One-off diagnostic script — NOT part of the app. Exercises the Paystack
// webhook endpoint (app/api/webhooks/paystack/route.ts) with correctly (and
// incorrectly) signed synthetic payloads, since this sandbox has no public
// URL for Paystack itself to reach and no ngrok tunnel is set up.
//
// Run with:
//   node --env-file=.env.local scripts/test-webhook.mjs [--mutate]
//
// Without --mutate: only safe, non-mutating checks (bad signature is
// rejected; a validly-signed but unhandled event type is acknowledged
// without touching any data).
// With --mutate: additionally fires a real `subscription.disable` event
// for your own customer code, which flips your subscription's local status
// to cancelled/cancel_at_period_end=true (recoverable by doing another
// test checkout, or asking Claude to patch it back) — only do this if
// you're fine with that side effect on your test account right now.

import crypto from "node:crypto";

const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
if (!secret) {
  console.error("PAYSTACK_WEBHOOK_SECRET (or PAYSTACK_SECRET_KEY) not found in environment.");
  process.exit(1);
}

const url = "http://localhost:3000/api/webhooks/paystack";
const mutate = process.argv.includes("--mutate");

function sign(body) {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

async function post(body, signature) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
    body,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

console.log("=== Test 1: invalid signature is rejected ===");
{
  const payload = JSON.stringify({ event: "charge.success", data: { id: "test-invalid-sig", reference: "test-invalid-sig" } });
  const result = await post(payload, "not-a-real-signature");
  console.log(result.status === 401 ? "PASS (401 rejected)" : `FAIL (got ${result.status})`, result.body);
}

console.log("\n=== Test 2: valid signature, unhandled event type is acknowledged (no mutation) ===");
{
  const eventId = `test-ping-${Date.now()}`;
  const payload = JSON.stringify({ event: "test.ping", data: { id: eventId } });
  const result = await post(payload, sign(payload));
  console.log(result.status === 200 ? "PASS (200 acknowledged)" : `FAIL (got ${result.status})`, result.body);
}

console.log("\n=== Test 3: valid signature, same event id replayed (idempotency) ===");
{
  const eventId = `test-idempotency-${Date.now()}`;
  const payload = JSON.stringify({ event: "test.ping", data: { id: eventId } });
  const first = await post(payload, sign(payload));
  const second = await post(payload, sign(payload));
  const secondParsed = JSON.parse(second.body);
  console.log(first.status === 200 && secondParsed.alreadyProcessed === true ? "PASS (second call flagged alreadyProcessed)" : "FAIL", first.body, second.body);
}

if (mutate) {
  console.log("\n=== Test 4 (--mutate): real subscription.disable event for your account ===");
  const custRes = await fetch(`https://api.paystack.co/customer/bartholomewiwuoha@gmail.com`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const custBody = await custRes.json();
  const customerCode = custBody?.data?.customer_code;
  if (!customerCode) {
    console.error("Could not resolve your Paystack customer_code — skipping Test 4.");
  } else {
    const eventId = `test-disable-${Date.now()}`;
    const payload = JSON.stringify({
      event: "subscription.disable",
      data: { id: eventId, customer: { customer_code: customerCode } },
    });
    const result = await post(payload, sign(payload));
    console.log(result.status === 200 ? "Sent (check the Billing page / your subscription status)" : `FAIL (got ${result.status})`, result.body);
  }
} else {
  console.log("\n(Skipped Test 4 — a real state-mutating event. Re-run with --mutate to include it.)");
}
