-- =============================================================================
-- Constory V1 — Phase 7.5: Monetization, pricing, subscriptions, AI credits
--
-- Architecture note (documented in full in PHASE7_5_COMPLETION_REPORT.md):
-- In Constory's existing data model a "brand" IS a workspace (1:1 with
-- brand_profiles, confirmed by its unique workspace_id FK) — there is no
-- separate "brand" entity. A plan's "brands/workspaces" limit is therefore
-- inherently an account-wide cap across everything one owner has created,
-- which a subscription scoped to a single workspace_id cannot enforce on its
-- own. Billing here is deliberately modeled per ACCOUNT (owner_id, i.e.
-- profiles.id) rather than per workspace_id: one subscription and one AI
-- credit pool per owner, shared across every workspace they own. This is the
-- only self-consistent reading of the spec that doesn't let a user multiply
-- their AI credit allowance for free by creating extra workspaces.
-- =============================================================================

-- =============================================================================
-- workspaces: downgrade grace-handling flag.
-- When an owner's plan can no longer cover every workspace they own, excess
-- workspaces are locked (read-only, no new content) rather than deleted. See
-- lib/billing/entitlements.ts and services/billing-service.ts.
-- =============================================================================
alter table public.workspaces add column if not exists billing_locked boolean not null default false;

-- =============================================================================
-- subscriptions — one row per account (owner). Provider-agnostic: `provider`
-- is 'none' until a real payment processor is connected (see
-- lib/billing/provider.ts). Column set matches the spec's recommended shape.
-- =============================================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,

  plan_id text not null default 'free' check (plan_id in ('free', 'creator', 'pro')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'cancelled', 'expired')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'quarterly', 'annual')),

  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '1 month'),
  cancel_at_period_end boolean not null default false,

  provider text not null default 'none' check (provider in ('none', 'manual', 'paystack')),
  provider_customer_id text,
  provider_subscription_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_owner_id_idx on public.subscriptions (owner_id);

-- =============================================================================
-- credit_balances — the authoritative AI credit ledger balance per account.
-- One row per owner; credits_used resets to 0 and monthly_allocation is
-- refreshed whenever the current period has elapsed (see
-- consume_ai_credits() below). Unused credits never roll over (spec §7).
-- =============================================================================
create table if not exists public.credit_balances (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,

  period_start timestamptz not null default now(),
  period_end timestamptz not null default (now() + interval '1 month'),
  monthly_allocation integer not null default 10,
  credits_used integer not null default 0 check (credits_used >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists credit_balances_owner_id_idx on public.credit_balances (owner_id);

-- =============================================================================
-- ai_usage_ledger — an append-only record of every credit-consuming AI
-- action. Only ever written by consume_ai_credits() below (SECURITY DEFINER),
-- never directly by client code, so this is authoritative usage history.
-- =============================================================================
create table if not exists public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  action_type text not null check (
    action_type in ('generate_post', 'regenerate_post', 'improve_content', 'generate_ideas', 'generate_strategy', 'generate_calendar')
  ),
  credits_used integer not null check (credits_used > 0),
  request_status text not null default 'success' check (request_status in ('success', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_ledger_owner_id_idx on public.ai_usage_ledger (owner_id);
create index if not exists ai_usage_ledger_workspace_id_idx on public.ai_usage_ledger (workspace_id);
create index if not exists ai_usage_ledger_created_at_idx on public.ai_usage_ledger (created_at);

drop trigger if exists set_updated_at on public.subscriptions;
create trigger set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.credit_balances;
create trigger set_updated_at before update on public.credit_balances for each row execute function public.set_updated_at();

-- =============================================================================
-- Auto-provision a Free subscription + credit pool the moment a profile is
-- created (i.e. the moment someone signs up) — mirrors handle_new_user in
-- migration 0002. Every account has billing state from day one; there is no
-- "no subscription" state to handle throughout the app.
-- =============================================================================
create or replace function public.handle_new_profile_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (owner_id, plan_id, status, billing_interval)
  values (new.id, 'free', 'active', 'monthly')
  on conflict (owner_id) do nothing;

  insert into public.credit_balances (owner_id, period_start, period_end, monthly_allocation, credits_used)
  values (new.id, now(), now() + interval '1 month', 10, 0)
  on conflict (owner_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_profile_created_billing on public.profiles;
create trigger on_profile_created_billing
  after insert on public.profiles
  for each row execute function public.handle_new_profile_billing();

-- Backfill: any profile created before this migration ran (i.e. everyone,
-- the first time this ships) needs a Free subscription + credit pool too —
-- the trigger above only fires for profiles inserted from now on.
insert into public.subscriptions (owner_id, plan_id, status, billing_interval)
select p.id, 'free', 'active', 'monthly'
from public.profiles p
where not exists (select 1 from public.subscriptions s where s.owner_id = p.id);

insert into public.credit_balances (owner_id, period_start, period_end, monthly_allocation, credits_used)
select p.id, now(), now() + interval '1 month', 10, 0
from public.profiles p
where not exists (select 1 from public.credit_balances c where c.owner_id = p.id);

-- =============================================================================
-- RLS helper: can the current user view this owner's billing data? Either
-- they ARE that owner, or they're a member of a workspace that owner owns
-- (so a shared workspace's editor/viewer can see plan + credit status —
-- read-only; only the owner can change or cancel a plan).
-- =============================================================================
create or replace function public.is_billing_owner(target_owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() = target_owner_id;
$$;

create or replace function public.can_view_billing(target_owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() = target_owner_id
    or exists (
      select 1
      from public.workspaces w
      join public.workspace_members wm on wm.workspace_id = w.id
      where w.owner_id = target_owner_id
        and wm.user_id = auth.uid()
    );
$$;

-- =============================================================================
-- consume_ai_credits — the single, atomic, concurrency-safe entry point for
-- spending AI credits. Callers pass the workspace performing the action, the
-- action type (or null for a zero-cost "peek"), the credit cost (0 to only
-- check/roll over the period without spending), and the account's current
-- plan allocation (resolved server-side from lib/billing/plans.ts, the single
-- source of truth for plan numbers — this function does not hard-code them).
--
-- Concurrency safety: `select ... for update` takes a row lock on the
-- account's credit_balances row for the remainder of this function call.
-- Postgres serializes concurrent callers on that lock, so two simultaneous
-- requests (double-click, two tabs, a genuine race) cannot both observe the
-- same "credits available" snapshot and overspend — the second caller blocks
-- until the first's UPDATE commits, then re-reads the now-updated row.
-- =============================================================================
create or replace function public.consume_ai_credits(
  p_workspace_id uuid,
  p_action_type text,
  p_credits integer,
  p_plan_allocation integer
)
returns table (ok boolean, remaining integer, monthly_allocation integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_balance record;
begin
  if not public.is_workspace_member(p_workspace_id) then
    return query select false, 0, 0, 'not_a_member';
    return;
  end if;

  select owner_id into v_owner_id from public.workspaces where id = p_workspace_id;
  if v_owner_id is null then
    return query select false, 0, 0, 'workspace_not_found';
    return;
  end if;

  select * into v_balance from public.credit_balances where owner_id = v_owner_id for update;
  if not found then
    return query select false, 0, 0, 'no_balance';
    return;
  end if;

  -- Roll over to a fresh monthly period if the current one has elapsed.
  -- Unused credits from the prior period are discarded (spec §7).
  if now() >= v_balance.period_end then
    update public.credit_balances
      set period_start = v_balance.period_end,
          period_end = v_balance.period_end + interval '1 month',
          monthly_allocation = p_plan_allocation,
          credits_used = 0,
          updated_at = now()
      where owner_id = v_owner_id
      returning * into v_balance;
  end if;

  -- p_credits = 0 is a "peek": report the (possibly just-rolled-over) balance
  -- without spending anything or writing a ledger row.
  if p_credits <= 0 then
    return query select true, greatest(v_balance.monthly_allocation - v_balance.credits_used, 0), v_balance.monthly_allocation, 'ok';
    return;
  end if;

  if v_balance.credits_used + p_credits > v_balance.monthly_allocation then
    return query select false, greatest(v_balance.monthly_allocation - v_balance.credits_used, 0), v_balance.monthly_allocation, 'insufficient_credits';
    return;
  end if;

  update public.credit_balances
    set credits_used = credits_used + p_credits, updated_at = now()
    where owner_id = v_owner_id
    returning * into v_balance;

  insert into public.ai_usage_ledger (owner_id, workspace_id, user_id, action_type, credits_used, request_status)
  values (v_owner_id, p_workspace_id, auth.uid(), p_action_type, p_credits, 'success');

  return query select true, greatest(v_balance.monthly_allocation - v_balance.credits_used, 0), v_balance.monthly_allocation, 'ok';
end;
$$;

grant execute on function public.consume_ai_credits(uuid, text, integer, integer) to authenticated;

-- =============================================================================
-- apply_plan_change — the one write path for an upgrade/downgrade/plan
-- switch (see lib/billing/provider.ts's ManualBillingProvider). Updates the
-- subscription AND immediately resets the credit period to the new plan's
-- allocation in a single atomic call, and only for the account's own owner
-- (defense in depth on top of the subscriptions_update_owner RLS policy,
-- since this also touches credit_balances, which has no direct-write policy
-- for `authenticated` at all).
-- =============================================================================
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
  if not public.is_billing_owner(p_owner_id) then
    raise exception 'Not authorized to change this subscription.';
  end if;

  update public.subscriptions
    set plan_id = p_plan_id,
        status = p_status,
        billing_interval = p_billing_interval,
        current_period_start = p_period_start,
        current_period_end = p_period_end,
        cancel_at_period_end = p_cancel_at_period_end,
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

grant execute on function public.apply_plan_change(uuid, text, text, text, timestamptz, timestamptz, boolean, integer) to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.subscriptions enable row level security;
alter table public.credit_balances enable row level security;
alter table public.ai_usage_ledger enable row level security;

create policy "subscriptions_select_viewable" on public.subscriptions
  for select using (public.can_view_billing(owner_id));

-- Plan changes (upgrade/downgrade/cancel) are only ever performed by the
-- owner, through services/billing-service.ts + lib/billing/provider.ts —
-- this policy is the actual enforcement boundary, the service layer is
-- defense in depth on top of it.
create policy "subscriptions_update_owner" on public.subscriptions
  for update using (public.is_billing_owner(owner_id)) with check (public.is_billing_owner(owner_id));

-- No insert/delete policy for `authenticated`: rows are only ever created by
-- the handle_new_profile_billing trigger (SECURITY DEFINER) and never deleted.

create policy "credit_balances_select_viewable" on public.credit_balances
  for select using (public.can_view_billing(owner_id));

-- No insert/update/delete policy for `authenticated`: writes only happen
-- through consume_ai_credits() (SECURITY DEFINER) or the plan-change trigger
-- below — never directly, so a client can never inflate its own balance.

create policy "ai_usage_ledger_select_viewable" on public.ai_usage_ledger
  for select using (public.can_view_billing(owner_id));

-- No insert/update/delete policy for `authenticated`: rows are only ever
-- written by consume_ai_credits() (SECURITY DEFINER).
