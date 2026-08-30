import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getBillingProvider } from "@/lib/billing/provider";
import { activatePaidPlanFromPayment, markSubscriptionPastDue, markSubscriptionCancelledByProvider, recordBillingEvent } from "@/services/billing-service";
import type { PlanId, BillingInterval } from "@/types/database";

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
  const eventId = typeof data.id !== "undefined" ? String(data.id) : (typeof data.reference === "string" ? data.reference : null);

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
        const planId = typeof metadata.plan_slug === "string" ? (metadata.plan_slug as PlanId) : null;
        const billingInterval = typeof metadata.billing_interval === "string" ? (metadata.billing_interval as BillingInterval) : null;
        const customer = (data.customer ?? {}) as Record<string, unknown>;

        if (ownerId && planId && billingInterval) {
          // `data.plan` on a charge.success event is Paystack's *plan code*
          // (already known to us via lib/billing/paystack-plan-codes.ts),
          // not a subscription code — there is no subscription identifier
          // reliably present at this event, so only the customer code is
          // recorded here.
          await activatePaidPlanFromPayment(adminSupabase, ownerId, planId, billingInterval, {
            customerCode: typeof customer.customer_code === "string" ? customer.customer_code : null,
          });
        }
        break;
      }

      case "invoice.payment_failed":
      case "subscription.expiring_cards": {
        const customer = (data.customer ?? {}) as Record<string, unknown>;
        const email = typeof customer.email === "string" ? customer.email : null;
        // Paystack invoice/subscription events identify the customer by
        // email/customer code rather than by our own user id — resolve via
        // the subscription row we recorded provider_customer_id on.
        if (email) await markPastDueByEmail(adminSupabase, email);
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
    // The event is already recorded as processed above (idempotency must
    // win over retries), but log-worthy failures still get a distinct
    // status for operators reviewing billing_events.
    await recordBillingEvent(adminSupabase, {
      provider: "paystack",
      providerEventId: `${eventId}:error`,
      eventType,
      ownerId: null,
      status: "error",
      detail: err instanceof Error ? err.message : "Unknown error",
    }).catch(() => {});
    return NextResponse.json({ received: true, error: "Processing failed, recorded for follow-up." }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}

type AdminDB = ReturnType<typeof createAdminClient>;

async function markPastDueByEmail(adminSupabase: AdminDB, email: string): Promise<void> {
  // No direct email column on subscriptions — resolve owner via auth admin lookup would need the admin auth API;
  // out of scope for V1 without a stored email-to-owner index. Deliberately a no-op if we can't resolve it, rather
  // than guessing which account this applies to.
  const { data: users } = await adminSupabase.auth.admin.listUsers();
  const match = users?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!match) return;
  await markSubscriptionPastDue(adminSupabase, match.id);
}

async function markCancelledByCustomerCode(adminSupabase: AdminDB, customerCode: string): Promise<void> {
  const { data } = await adminSupabase.from("subscriptions").select("owner_id").eq("provider_customer_id", customerCode).maybeSingle();
  if (!data?.owner_id) return;
  await markSubscriptionCancelledByProvider(adminSupabase, data.owner_id);
}
