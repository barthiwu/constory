-- =============================================================================
-- Constory V1 — Phase 7.5 update: Paystack webhook idempotency ledger.
--
-- Paystack is the confirmed payment provider (see lib/billing/paystack-*.ts
-- and app/api/webhooks/paystack/route.ts). This table exists purely so the
-- webhook handler can never process the same provider event twice — Paystack
-- (like any webhook sender) can redeliver an event, and "the same webhook
-- must never cause multiple actions" (spec v1.1 §19) is enforced here via a
-- unique constraint, not by hoping the handler runs exactly once.
--
-- This table is written only by the webhook route using the service-role
-- (admin) client — there is no user session on an inbound webhook request,
-- so there is nothing for RLS to scope reads/writes to. It intentionally has
-- no RLS policies for `authenticated` at all: this is an internal
-- reconciliation ledger, not user-facing data.
-- =============================================================================

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack' check (provider in ('paystack')),
  provider_event_id text not null,
  event_type text not null,
  owner_id uuid references public.profiles (id) on delete set null,
  status text not null default 'processed' check (status in ('processed', 'ignored', 'error')),
  detail text,
  created_at timestamptz not null default now(),

  unique (provider, provider_event_id)
);

create index if not exists billing_events_owner_id_idx on public.billing_events (owner_id);
create index if not exists billing_events_created_at_idx on public.billing_events (created_at);

alter table public.billing_events enable row level security;
-- No policies granted to `authenticated` — see the file comment above.
