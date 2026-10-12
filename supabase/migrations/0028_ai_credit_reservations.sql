-- =============================================================================
-- Constory V1 -- reserve-then-settle AI credits (closes the credit race) and
-- keep read-only members from spending credits.
--
-- THE RACE. Credits used to be checked BEFORE the OpenAI call (canUseAI) and
-- consumed AFTER it (consume_ai_credits). Between those two points nothing was
-- held, so N parallel requests all passed the check while credit remained and
-- all ran a paid generation; only the first few could then be charged.
--
-- THE FIX. reserve_ai_credits() atomically deducts the credits (under the same
-- row lock consume_ai_credits used) BEFORE any AI work starts and returns a
-- reservation id. Once the generation succeeds the server calls
-- settle_ai_credits(); if it fails the server calls refund_ai_credits(). A
-- reservation the server never settled or refunded (crash, timeout) is
-- refunded automatically the next time that owner reserves, once it is older
-- than 10 minutes -- so a crash can't silently eat a customer's credits.
-- settle/refund are service_role only: the reservation id is visible to the
-- owner in ai_usage_ledger while a request is in flight, and letting a client
-- call refund directly would hand them a free generation.
--
-- ROLES. Spending credits requires owner/admin/editor. A 'viewer' is read-only
-- everywhere else (RLS) and must not be able to burn the owner's AI credits
-- either -- including by calling the old consume_ai_credits() RPC directly.
-- =============================================================================

-- Ledger rows now have a lifecycle: reserved -> success | refunded (failed kept for history).
alter table public.ai_usage_ledger drop constraint if exists ai_usage_ledger_request_status_check;
alter table public.ai_usage_ledger
  add constraint ai_usage_ledger_request_status_check
  check (request_status in ('reserved', 'success', 'failed', 'refunded'));

create index if not exists ai_usage_ledger_reserved_idx
  on public.ai_usage_ledger (owner_id, created_at)
  where request_status = 'reserved';

-- ---- reserve ------------------------------------------------------------------
create or replace function public.reserve_ai_credits(
  p_workspace_id uuid,
  p_action_type text,
  p_credits integer
)
returns table (ok boolean, reservation_id uuid, remaining integer, monthly_allocation integer, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_plan_id text;
  v_plan_allocation integer;
  v_locked boolean;
  v_balance record;
  v_stale_credits integer;
  v_reservation_id uuid;
begin
  if p_credits is null or p_credits <= 0 then
    return query select false, null::uuid, 0, 0, 'invalid_amount';
    return;
  end if;

  if not public.is_workspace_editor(p_workspace_id) then
    if public.is_workspace_member(p_workspace_id) then
      return query select false, null::uuid, 0, 0, 'viewer_cannot_use_ai';
    end if;
    return query select false, null::uuid, 0, 0, 'not_a_member';
    return;
  end if;

  select owner_id, billing_locked into v_owner_id, v_locked from public.workspaces where id = p_workspace_id;
  if v_owner_id is null then
    return query select false, null::uuid, 0, 0, 'workspace_not_found';
    return;
  end if;
  if coalesce(v_locked, false) then
    return query select false, null::uuid, 0, 0, 'workspace_locked';
    return;
  end if;

  select plan_id into v_plan_id from public.subscriptions where owner_id = v_owner_id;
  v_plan_allocation := case coalesce(v_plan_id, 'free')
    when 'creator' then 85
    when 'pro' then 260
    else 10 -- free, and any unrecognized/missing plan_id fails safe to the Free allowance
  end;

  -- The row lock serialises concurrent reservations for the same owner: this is what makes
  -- the check-and-deduct atomic.
  select * into v_balance from public.credit_balances where owner_id = v_owner_id for update;
  if not found then
    return query select false, null::uuid, 0, 0, 'no_balance';
    return;
  end if;

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

  -- Self-heal: give back credits held by reservations the server never settled/refunded.
  with stale as (
    update public.ai_usage_ledger
       set request_status = 'refunded'
     where owner_id = v_owner_id
       and request_status = 'reserved'
       and created_at < now() - interval '10 minutes'
    returning credits_used, created_at
  )
  select coalesce(sum(credits_used) filter (where created_at >= v_balance.period_start), 0)
    into v_stale_credits from stale;
  if v_stale_credits > 0 then
    update public.credit_balances
      set credits_used = greatest(credits_used - v_stale_credits, 0), updated_at = now()
      where owner_id = v_owner_id
      returning * into v_balance;
  end if;

  if v_balance.credits_used + p_credits > v_balance.monthly_allocation then
    return query select false, null::uuid,
      greatest(v_balance.monthly_allocation - v_balance.credits_used, 0), v_balance.monthly_allocation, 'insufficient_credits';
    return;
  end if;

  update public.credit_balances
    set credits_used = credits_used + p_credits, updated_at = now()
    where owner_id = v_owner_id
    returning * into v_balance;

  insert into public.ai_usage_ledger (owner_id, workspace_id, user_id, action_type, credits_used, request_status)
  values (v_owner_id, p_workspace_id, auth.uid(), p_action_type, p_credits, 'reserved')
  returning id into v_reservation_id;

  return query select true, v_reservation_id,
    greatest(v_balance.monthly_allocation - v_balance.credits_used, 0), v_balance.monthly_allocation, 'ok';
end;
$$;

revoke execute on function public.reserve_ai_credits(uuid, text, integer) from public, anon;
grant execute on function public.reserve_ai_credits(uuid, text, integer) to authenticated, service_role;

-- ---- settle -------------------------------------------------------------------
create or replace function public.settle_ai_credits(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ai_usage_ledger
     set request_status = 'success'
   where id = p_reservation_id and request_status = 'reserved';
  return found;
end;
$$;

revoke execute on function public.settle_ai_credits(uuid) from public, anon, authenticated;
grant execute on function public.settle_ai_credits(uuid) to service_role;

-- ---- refund -------------------------------------------------------------------
create or replace function public.refund_ai_credits(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_row record;
begin
  select owner_id into v_owner_id from public.ai_usage_ledger where id = p_reservation_id;
  if v_owner_id is null then
    return false;
  end if;

  -- Same lock order as reserve_ai_credits (balance first, then ledger) so the two can't deadlock.
  perform 1 from public.credit_balances where owner_id = v_owner_id for update;

  update public.ai_usage_ledger
     set request_status = 'refunded'
   where id = p_reservation_id and request_status = 'reserved'
  returning owner_id, credits_used, created_at into v_row;
  if not found then
    return false; -- already settled or refunded: idempotent
  end if;

  -- Only give the credits back if the credit period hasn't rolled over since (a rollover already reset credits_used to 0).
  update public.credit_balances
     set credits_used = greatest(credits_used - v_row.credits_used, 0), updated_at = now()
   where owner_id = v_row.owner_id and period_start <= v_row.created_at;
  return true;
end;
$$;

revoke execute on function public.refund_ai_credits(uuid) from public, anon, authenticated;
grant execute on function public.refund_ai_credits(uuid) to service_role;

-- ---- legacy consume_ai_credits: spending now needs an editor ---------------------
-- No longer called by the app (it reserves instead) but still granted to `authenticated`,
-- so it must not let a viewer spend credits. p_credits = 0 (the balance "peek") stays open to any member.
create or replace function public.consume_ai_credits(
  p_workspace_id uuid,
  p_action_type text,
  p_credits integer
)
returns table (ok boolean, remaining integer, monthly_allocation integer, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
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

  if p_credits > 0 and not public.is_workspace_editor(p_workspace_id) then
    return query select false, 0, 0, 'viewer_cannot_use_ai';
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
    else 10
  end;

  select * into v_balance from public.credit_balances where owner_id = v_owner_id for update;
  if not found then
    return query select false, 0, 0, 'no_balance';
    return;
  end if;

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

revoke execute on function public.consume_ai_credits(uuid, text, integer) from public, anon;
grant execute on function public.consume_ai_credits(uuid, text, integer) to authenticated, service_role;
