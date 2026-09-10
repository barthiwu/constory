-- =============================================================================
-- Constory V1 — deferred plan downgrades + real Paystack subscription
-- lifecycle (disable the old plan's recurring charge, auto-bill the new
-- plan at renewal).
--
-- Part 1 (unchanged from the original version of this migration):
-- Previously, ANY plan change (upgrade or downgrade) that wasn't Free went
-- through a brand-new Paystack checkout immediately, including a downgrade
-- to a still-paid lower tier (e.g. Pro -> Creator) — charging the account
-- again right away with no credit for the Pro time already paid for. Only
-- "Cancel subscription" (-> Free) deferred to the end of the current period
-- via `cancel_at_period_end`.
--
-- Product decision: every downgrade (to Free or to a cheaper paid plan)
-- should behave the way Cancel already does — the account keeps its
-- current plan's benefits until the paid period it already paid for ends,
-- then moves to the new, cheaper plan. Only upgrades (and the Free ->
-- anything first purchase) take effect immediately via checkout.
--
-- This adds `pending_plan_id` / `pending_billing_interval`: the plan the
-- account will move to when `current_period_end` is reached. Cancelling
-- (-> Free) is now just the pending_plan_id = 'free' case, sharing the same
-- mechanism instead of a parallel one — see cancelSubscription /
-- scheduleDowngrade / resumeSubscription in services/billing-service.ts.
--
-- Neither new column is added to the `authenticated` column-update grant
-- from migration 0010 — exactly like `plan_id` itself, setting a pending
-- plan is a price-authority action and must go through the service-role
-- RPCs below (called only from trusted server code that has already
-- decided a downgrade is legitimate), never directly from a client session.
--
-- Part 2 (new): the local-only version above still left Paystack itself
-- billing the OLD (higher) plan price for one more cycle on any scheduled
-- downgrade, since nothing ever called Paystack's /subscription/disable —
-- see the "does NOT touch Paystack at all" comment this migration's code
-- changes remove from lib/billing/paystack-provider.ts. To fix that for
-- real, the app needs two pieces of Paystack subscription state it
-- previously read and discarded:
--   - `provider_authorization_code` — the reusable card token, needed to
--     start a new Paystack subscription on the new plan when the period
--     actually ends (no separate checkout, no card re-entry).
--   - `provider_subscription_token` — Paystack's per-subscription
--     `email_token`, required alongside `provider_subscription_id`
--     (already existed) to call /subscription/disable or /subscription/enable.
-- Both are payment-capable secrets (the authorization code in particular
-- can be used to charge the card), so — same reasoning and same mechanism
-- as migration 0010's column-level UPDATE grants — `authenticated` gets no
-- SELECT access to either column at all. Every other existing column stays
-- readable exactly as before this migration.
-- =============================================================================

alter table public.subscriptions
  add column if not exists pending_plan_id text
    check (pending_plan_id in ('free', 'creator', 'pro')),
  add column if not exists pending_billing_interval text
    check (pending_billing_interval in ('monthly', 'quarterly', 'annual')),
  add column if not exists provider_subscription_token text,
  add column if not exists provider_authorization_code text;

-- -----------------------------------------------------------------------------
-- Lock down SELECT on the two new secret columns to service_role only.
-- Postgres RLS is row-level, not column-level — the existing
-- subscriptions_select_* policies already let an account's own
-- owner/members read this row, which would otherwise hand the raw
-- authorization code (a live "charge this card" token) straight to the
-- billing page's browser bundle. Column-level GRANT is the only mechanism
-- that actually restricts this, same as migration 0010's UPDATE grants.
-- -----------------------------------------------------------------------------
revoke select on public.subscriptions from public, anon, authenticated;
grant select (
  id, owner_id, plan_id, status, billing_interval,
  current_period_start, current_period_end, cancel_at_period_end,
  pending_plan_id, pending_billing_interval,
  provider, provider_customer_id, provider_subscription_id,
  created_at, updated_at
) on public.subscriptions to authenticated;

-- -----------------------------------------------------------------------------
-- set_subscription_pending_change — the one write path for scheduling (or
-- clearing) a future plan transition. Used for all three self-service
-- pending-state changes:
--   cancel ("Cancel subscription")       -> (true,  'free', null)
--   schedule a paid downgrade            -> (false, <plan>, <interval>)
--   resume / "Keep my plan"              -> (false, null,   null)
-- Service-role only, same trust boundary as apply_plan_change (migration
-- 0010): the caller (a Server Action that has already resolved the caller's
-- own session to an owner_id) is what's trusted, not auth.uid() here.
-- -----------------------------------------------------------------------------
create or replace function public.set_subscription_pending_change(
  p_owner_id uuid,
  p_cancel_at_period_end boolean,
  p_pending_plan_id text,
  p_pending_billing_interval text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pending_plan_id is not null and p_pending_plan_id not in ('free', 'creator', 'pro') then
    raise exception 'Invalid pending plan_id: %', p_pending_plan_id;
  end if;

  update public.subscriptions
    set cancel_at_period_end = p_cancel_at_period_end,
        pending_plan_id = p_pending_plan_id,
        pending_billing_interval = p_pending_billing_interval,
        updated_at = now()
    where owner_id = p_owner_id;
end;
$$;

grant execute on function public.set_subscription_pending_change(uuid, boolean, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- resolve_scheduled_plan_change — applies a pending plan transition once the
-- current period has actually ended (called lazily from
-- getResolvedSubscription, exactly like the old cancel-to-free resolution
-- it replaces — see that function's comment in services/billing-service.ts).
-- As of Part 2, the caller passes the NEW Paystack subscription id/token
-- when the transition included a real Paystack charge (a downgrade to a
-- still-paid plan) so this can update them atomically with everything else;
-- both are left untouched (null = "don't change") when resolving to Free,
-- or when the account isn't on the Paystack provider at all.
--
-- Deliberately does NOT touch `provider` / `provider_customer_id`, unlike
-- apply_plan_change (which always stamps provider = 'manual'). This is a
-- scheduled transition on an *existing* subscription, not a new plan
-- purchase — whichever provider already owns the account (Paystack, in the
-- live environment) keeps owning it.
-- -----------------------------------------------------------------------------
create or replace function public.resolve_scheduled_plan_change(
  p_owner_id uuid,
  p_plan_id text,
  p_billing_interval text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_credit_allocation integer,
  p_provider_subscription_id text default null,
  p_provider_subscription_token text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_plan_id not in ('free', 'creator', 'pro') then
    raise exception 'Invalid plan_id: %', p_plan_id;
  end if;

  update public.subscriptions
    set plan_id = p_plan_id,
        status = 'active',
        billing_interval = p_billing_interval,
        current_period_start = p_period_start,
        current_period_end = p_period_end,
        cancel_at_period_end = false,
        pending_plan_id = null,
        pending_billing_interval = null,
        provider_subscription_id = coalesce(p_provider_subscription_id, provider_subscription_id),
        provider_subscription_token = coalesce(p_provider_subscription_token, provider_subscription_token),
        updated_at = now()
    where owner_id = p_owner_id;

  update public.credit_balances
    set period_start = p_period_start,
        period_end = p_period_end,
        monthly_allocation = p_credit_allocation,
        credits_used = 0,
        updated_at = now()
    where owner_id = p_owner_id;
end;
$$;

grant execute on function public.resolve_scheduled_plan_change(uuid, text, text, timestamptz, timestamptz, integer, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- mark_subscription_past_due — used by the lazy-resolution path when a real
-- Paystack charge attempt for the new (post-downgrade) plan fails outright
-- (the /subscription API call itself errors — an async decline that
-- arrives later via the invoice.payment_failed webhook is already handled
-- by markSubscriptionPastDue in services/billing-service.ts). Deliberately
-- leaves pending_plan_id/pending_billing_interval untouched so the next
-- visit retries the same transition rather than silently giving up on it.
-- -----------------------------------------------------------------------------
create or replace function public.mark_subscription_past_due(p_owner_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscriptions set status = 'past_due', updated_at = now() where owner_id = p_owner_id;
$$;

grant execute on function public.mark_subscription_past_due(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- apply_plan_change (immediate changes: Free via the Manual provider, or any
-- plan set directly by trusted server code) must also clear a stale pending
-- downgrade — an immediate change supersedes anything previously scheduled.
-- Re-declaring with the same signature as migration 0010, service-role only.
-- -----------------------------------------------------------------------------
create or replace function public.apply_plan_change(
  p_owner_id uuid,
  p_plan_id text,
  p_status text,
  p_billing_interval text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_credit_allocation integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_plan_id not in ('free', 'creator', 'pro') then
    raise exception 'Invalid plan_id: %', p_plan_id;
  end if;

  update public.subscriptions
    set plan_id = p_plan_id,
        status = p_status,
        billing_interval = p_billing_interval,
        current_period_start = p_period_start,
        current_period_end = p_period_end,
        cancel_at_period_end = p_cancel_at_period_end,
        pending_plan_id = null,
        pending_billing_interval = null,
        provider = 'manual',
        updated_at = now()
    where owner_id = p_owner_id;

  update public.credit_balances
    set period_start = p_period_start,
        period_end = p_period_end,
        monthly_allocation = p_credit_allocation,
        credits_used = 0,
        updated_at = now()
    where owner_id = p_owner_id;
end;
$$;

grant execute on function public.apply_plan_change(uuid, text, text, text, timestamptz, timestamptz, boolean, integer) to service_role;
