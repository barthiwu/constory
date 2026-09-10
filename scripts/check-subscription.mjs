// One-off diagnostic script — NOT part of the app, just for live debugging
// the cancel-subscription 404. Run with:
//   node --env-file=.env.local scripts/check-subscription.mjs your@email.com
// Prints the raw Paystack customer + subscriptions payload so we can see
// the real `status` field Paystack currently has on file (active /
// non-renewing / attention / completed / cancelled), which the app's
// higher-level types don't expose.

const email = process.argv[2];
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/check-subscription.mjs <email>");
  process.exit(1);
}

const key = process.env.PAYSTACK_SECRET_KEY;
if (!key) {
  console.error("PAYSTACK_SECRET_KEY not found in environment (did --env-file=.env.local load?)");
  process.exit(1);
}

const res = await fetch(`https://api.paystack.co/customer/${encodeURIComponent(email)}`, {
  headers: { Authorization: `Bearer ${key}` },
});
const body = await res.json();

if (!res.ok || body.status === false) {
  console.error("Customer lookup failed:", res.status, JSON.stringify(body, null, 2));
  process.exit(1);
}

const customer = body.data;
console.log("customer_code:", customer.customer_code);
console.log("email:", customer.email);
console.log("subscriptions found:", (customer.subscriptions ?? []).length);
console.log("");

for (const sub of customer.subscriptions ?? []) {
  console.log("----");
  console.log("subscription_code:", sub.subscription_code);
  console.log("email_token:", sub.email_token);
  console.log("status:", sub.status);
  console.log("plan:", sub.plan?.plan_code, sub.plan?.name);
  console.log("next_payment_date:", sub.next_payment_date);
  console.log("authorization:", sub.authorization?.authorization_code);
  console.log("createdAt:", sub.createdAt);
}
