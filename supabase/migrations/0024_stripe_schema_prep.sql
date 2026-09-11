-- =============================================================================
-- Constory V1 — schema prep only for a future Stripe billing provider
-- (lib/billing/stripe-provider.ts). This migration does NOT activate Stripe:
-- getBillingProvider() in lib/billing/provider.ts still only ever returns
-- Paystack or the Manual fallback — nothing here changes runtime behavior
-- for any existing account. It just widens two check constraints that would
-- otherwise reject a 'stripe' value outright, so the column is ready
-- whenever Stripe actually gets wired up in V2.
--
-- subscriptions.provider_customer_id / provider_subscription_id are generic
-- enough to hold Stripe's cus_/sub_ ids as-is — no new columns needed there.
-- provider_subscription_token (Paystack's per-subscription email token) has
-- no Stripe equivalent and simply stays null on a Stripe row.
-- =============================================================================

alter table public.subscriptions
  drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('none', 'manual', 'paystack', 'stripe'));

alter table public.billing_events
  drop constraint if exists billing_events_provider_check;
alter table public.billing_events
  add constraint billing_events_provider_check check (provider in ('paystack', 'stripe'));
