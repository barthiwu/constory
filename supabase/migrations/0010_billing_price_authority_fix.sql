-- =============================================================================
-- Constory V1 — Phase 7.5 correction: close a direct-database-access price/
-- credit-authority bypass found by the independent Phase 7.5 audit
-- (PHASE7_5_AUDIT_REPORT.md, Security Findings §1, CRITICAL).
--
-- THE PROBLEM: Supabase auto-publishes every public-schema table and
-- SECURITY DEFINER function granted to `authenticated` via PostgREST. Two
-- Phase 7.5 additions were reachable that way, completely bypassing the
-- Next.js app (and therefore Paystack, price resolution, and entitlement
-- checks), using nothing but a signed-in user's own session:
--
--   1. `subscriptions` had a broad `for update using (is_billing_owner(...))`
--      policy with no column restriction, so `PATCH /rest/v1/subscriptions
--      ?owner_id=eq.<self> {"plan_id":"pro", ...}` succeeded directly.
--   2. `apply_plan_change(...)` was `grant execute ... to authenticated` and
--      trusted its `p_plan_id`/`p_credit_allocation`/`p_period_*` parameters
--      verbatim from the caller, so `POST /rest/v1/rpc/apply_plan_change`
--      with an arbitrary plan/allocation succeeded directly, no payment.
--   3. `consume_ai_credits(...)` trusted a caller-supplied
--      `p_plan_allocation` at rollover time, so a caller could set an
--      arbitrary future allocation the same way.
--   4. `workspaces` had a similarly broad update policy from migration 0003,
--      predating Phase 7.5 — and Phase 7.5 added `billing_locked` to that
--      already-broadly-writable table without protecting the new column, so
--      any editor could self-reverse a downgrade lock directly.
--
-- THE FIX: narrow self-service writes on `subscriptions`/`workspaces` to an
-- explicit column allowlist (Postgres column-level GRANT — RLS policies
-- alone cannot restrict which columns a permitted row-update may touch), and
-- make `apply_plan_change` callable only by the service role, so every path
-- that can actually change a plan or credit allocation now requires the
-- ADMIN client — i.e. trusted server code that has already resolved price/
-- plan/payment-verification itself, exactly like `activatePaidPlanFromPayment`
-- already does. `consume_ai_credits` remains callable by `authenticated`
-- (spending your own credits during normal AI use is legitimate self-service)
-- but no longer accepts an allocation from the caller — it looks up the
-- account's real plan from `subscriptions.plan_id` itself.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) subscriptions: only `cancel_at_period_end` may be self-service updated
--    (cancel/resume). Every other column (plan_id, status, billing_interval,
--    period dates, provider, provider ids) now requires the service role.
-- -----------------------------------------------------------------------------
revoke update on public.subscriptions from public, anon, authenticated;
grant update (cancel_at_period_end) on public.subscriptions to authenticated;

-- -----------------------------------------------------------------------------
-- 2) workspaces: `billing_locked` (and owner_id/id/timestamps) are excluded
--    from the self-service editable set. Everything the app actually lets a
--    member edit today stays writable.
-- -----------------------------------------------------------------------------
revoke update on public.workspaces from public, anon, authenticated;
grant update (name, description, industry, website, primary_market, onboarding_step, onboarding_completed)
  on public.workspaces to authenticated;

-- -----------------------------------------------------------------------------
-- 3) apply_plan_change: no longer reachable by authenticated/anon at all —
--    only the service role (i.e. the Next.js admin client, from trusted
--    server code that has already decided a plan change is legitimate:
--    Free/no-payment-fallback via ManualBillingProvider, or a payment-
--    verified Paystack activation) can call it. `is_billing_owner` is no
--    longer meaningful here (there is no auth.uid() under a service-role
--    connection) — the trust boundary is now the EXECUTE grant itself, plus
--    the caller having already authenticated the target owner_id server-side
--    before ever reaching this function.
-- -----------------------------------------------------------------------------
revoke execute on function public.apply_plan_change(uuid, text, text, text, timestamptz, timestamptz, boolean, integer) from public, anon, authenticated;

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

-- -----------------------------------------------------------------------------
-- 4) consume_ai_credits: drop the caller-supplied p_plan_allocation parameter
--    entirely. The function now resolves the account's real plan from
--    subscriptions.plan_id itself and derives the credit allowance from a
--    hardcoded mapping mirroring lib/billing/plans.ts (PLANS.*.entitlements
--    .aiCreditsPerMonth). This intentionally duplicates those three numbers
--    at the DB layer as defense-in-depth — if lib/billing/plans.ts's credit
--    numbers ever change, this CASE must be updated to match (see
--    lib/billing/plans.test.ts, which will not catch DB/TS drift by itself —
--    a reviewer changing plan credit numbers must grep for this function).
-- -----------------------------------------------------------------------------
drop function if exists public.consume_ai_credits(uuid, text, integer, integer);

create or replace function public.consume_ai_credits(
  p_workspace_id uuid,
  p_action_type text,
  p_credits integer
)
returns table (ok boolean, remaining integer, monthly_allocation integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_plan_id text;
  v_plan_allocation integer;
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

  select plan_id into v_plan_id from public.subscriptions where owner_id = v_owner_id;
  v_plan_allocation := case coalesce(v_plan_id, 'free')
    when 'creator' then 85
    when 'pro' then 260
    else 10 -- free, and any unrecognized/missing plan_id fails safe to the Free allowance
  end;

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
          monthly_allocation = v_plan_allocation,
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

grant execute on function public.consume_ai_credits(uuid, text, integer) to authenticated;
