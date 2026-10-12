import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getBillingProvider } from "@/lib/billing/provider";
import {
  activatePaidPlanFromPayment,
  markSubscriptionPastDue,
  markSubscriptionCancelledByProvider,
  recordBillingEvent,
  releaseBillingEvent,
} from "@/services/billing-service";
import { resolveActiveProviderSubscription } from "@/lib/billing/paystack-subscription";
import { checkPaymentMatchesPlan, parsePaidPlanSelection } from "@/lib/billing/payment-guard";
import { expectedPaymentFor, chargeIdempotencyKey } from "@/lib/billing/payment-expectations";

/**
 * Paystack webhook endpoint (spec v1.1 §17-19). This is the authoritative
 * activation path in any environment Paystack can actually reach; see
 * lib/billing/paystack-provider.ts's verifyAndActivatePaymentReference for
 * the fallback "verify on return" path used where no public webhook URL
 * exists (this sandbox and most local dev). Both call the same
 * activatePaidPlanFromPayment()/services/billing-service.ts primitives and
 * share the same billing_events idempotency table, so whichever one runs
 * first for a given transaction wins and the other becomes a no-op.
 *
 * Nothing here ever trusts the request body until its signature is verified
 * against the raw bytes Paystack sent (spec §37) — request.text() is read
 * BEFORE any JSON parsing, and verification happens before any field of the
 * parsed payload is used for anything.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  const provider = getBillingProvider();
  if (!provider.verifyWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const eventType = event.event ?? "unknown";
  const data = event.data ?? {};
  // A charge is keyed by its transaction reference -- the SAME key the verify-on-return path
  // uses (see verifyAndActivatePaymentReference) -- so the webhook and the browser return can
  // never both apply one payment (a double apply would reset the period's used credits to 0
  // a second time).
  const eventId =
    eventType === "charge.success" && typeof data.reference === "string"
      ? chargeIdempotencyKey(data.reference)
      : typeof data.id !== "undefined"
        ? String(data.id)
        : typeof data.reference === "string"
          ? data.reference
          : null;

  const adminSupabase = createAdminClient();

  // No stable provider event id to dedupe on — acknowledge and drop rather
  // than risk double-processing an event we can't uniquely identify.
  if (!eventId) {
    return NextResponse.json({ received: true, ignored: "no_event_id" });
  }

  const { alreadyProcessed } = await recordBillingEvent(adminSupabase, {
    provider: "paystack",
    providerEventId: eventId,
    eventType,
    ownerId: null,
    status: "processed",
  });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, alreadyProcessed: true });
  }

  try {
    switch (eventType) {
      case "charge.success": {
        const metadata = (data.metadata ?? {}) as Record<string, unknown>;
        const ownerId = typeof metadata.user_id === "string" ? metadata.user_id : null;
        const selection = parsePaidPlanSelection(metadata.plan_slug, metadata.billing_interval);
        const customer = (data.customer ?? {}) as Record<string, unknown>;
        const authorization = (data.authorization ?? {}) as Record<string, unknown>;
        const customerCode = typeof customer.customer_code === "string" ? customer.customer_code : null;

        if (ownerId && selection) {
          const { planId, billingInterval } = selection;

          // The signature proves Paystack sent this; it does not prove the payment was FOR the
          // plan the metadata names. Cross-check the plan code / amount actually paid.
          const verdict = checkPaymentMatchesPlan(
            {
              amount: typeof data.amount === "number" ? data.amount : null,
              currency: typeof data.currency === "string" ? data.currency : null,
              plan: data.plan,
            },
            expectedPaymentFor(planId, billingInterval),
          );
          if (!verdict.ok) {
            await recordBillingEvent(adminSupabase, {
              provider: "paystack",
              providerEventId: `${eventId}:rejected`,
              eventType,
              ownerId,
              status: "error",
              detail: `Payment did not match the claimed plan (${planId}/${billingInterval}): ${verdict.reason}`,
            }).catch(() => {});
            break;
          }

          // `data.plan` on a charge.success event is Paystack's *plan code*
          // (already known to us via lib/billing/paystack-plan-codes.ts),
          // not a subscription code — Paystack creates the recurring
          // Subscription object asynchronously from a plan-code charge, so
          // it's resolved separately (best-effort: cancelSubscription/
          // scheduleDowngrade fall back to the same lookup later if it's
          // not there yet).
          let subscriptionCode: string | null = null;
          let subscriptionToken: string | null = null;
          if (customerCode) {
            try {
              const resolved = await resolveActiveProviderSubscription(customerCode);
              if (resolved) {
                subscriptionCode = resolved.subscriptionCode;
                subscriptionToken = resolved.emailToken;
              }
            } catch {
              // Non-fatal — see the comment above.
            }
          }

          await activatePaidPlanFromPayment(adminSupabase, ownerId, planId, billingInterval, {
            customerCode,
            subscriptionCode,
            subscriptionToken,
            authorizationCode: typeof authorization.authorization_code === "string" ? authorization.authorization_code : null,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        // NOTE: "subscription.expiring_cards" used to be handled here too, which flagged still-paying
        // customers as past_due merely because a card was ABOUT to expire. It's just a heads-up, so it
        // now falls through to the default (acknowledged, no state change).
        const customer = (data.customer ?? {}) as Record<string, unknown>;
        const customerCode = typeof customer.customer_code === "string" ? customer.customer_code : null;
        if (customerCode) await markPastDueByCustomerCode(adminSupabase, customerCode);
        break;
      }

      case "subscription.disable": {
        const customer = (data.customer ?? {}) as Record<string, unknown>;
        const customerCode = typeof customer.customer_code === "string" ? customer.customer_code : null;
        if (customerCode) await markCancelledByCustomerCode(adminSupabase, customerCode);
        break;
      }

      default:
        // Unhandled event types are acknowledged, not errors — Paystack
        // sends more event types than this V1 integration acts on.
        break;
    }
  } catch (err) {
    // Processing failed AFTER the event was claimed above. Previously the claim was left in
    // place and a 200 returned, which made every Paystack retry a no-op -- a customer who had
    // really paid could be left on their old plan forever. Release the claim and answer 5xx so
    // Paystack redelivers; the failure is also logged for operators reviewing billing_events.
    await recordBillingEvent(adminSupabase, {
      provider: "paystack",
      providerEventId: `${eventId}:error:${Date.now()}`,
      eventType,
      ownerId: null,
      status: "error",
      detail: err instanceof Error ? err.message : "Unknown error",
    }).catch(() => {});
    await releaseBillingEvent(adminSupabase, "paystack", eventId).catch((releaseErr) => {
      console.error("[paystack webhook] could not release the idempotency claim:", releaseErr);
    });
    return NextResponse.json({ received: true, error: "Processing failed; please retry." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

type AdminDB = ReturnType<typeof createAdminClient>;

async function markPastDueByCustomerCode(adminSupabase: AdminDB, customerCode: string): Promise<void> {
  // Resolve the account through the Paystack customer code we stored on the subscription at
  // activation. (This used to page through auth.admin.listUsers() by email, which only ever sees the
  // first page -- 50 users -- so for any larger user base a failed payment silently never matched.)
  const { data } = await adminSupabase.from("subscriptions").select("owner_id").eq("provider_customer_id", customerCode).maybeSingle();
  if (!data?.owner_id) return;
  await markSubscriptionPastDue(adminSupabase, data.owner_id);
}

async function markCancelledByCustomerCode(adminSupabase: AdminDB, customerCode: string): Promise<void> {
  const { data } = await adminSupabase.from("subscriptions").select("owner_id").eq("provider_customer_id", customerCode).maybeSingle();
  if (!data?.owner_id) return;
  await markSubscriptionCancelledByProvider(adminSupabase, data.owner_id);
}
