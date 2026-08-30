-- Fixes HIGH Security Finding §3 in PHASE7_5_AUDIT_REPORT.md: consume_ai_credits()
-- (migrations 0008/0010) lazily rolls an elapsed credit period over to a
-- fresh 0-used balance at the account's CURRENT plan allocation whenever an
-- AI action is attempted — but nothing ever did the same for a page that
-- merely *displays* the balance. app/app/(shell)/settings/billing/page.tsx
-- and app/app/(shell)/dashboard/page.tsx both read credit_balances directly
-- (services/billing-service.ts's getCreditBalance()), so a user who hasn't
-- taken an AI action since their period elapsed would see a stale,
-- already-expired period/allocation/usage until their next AI request
-- happened to trigger the rollover.
--
-- This adds a read path with the identical lazy-rollover behavior,
-- reusing the same plan-allocation mapping migration 0010 introduced in
-- consume_ai_credits() (intentionally duplicated at the SQL layer for the
-- same reason documented there — keep this CASE, migration 0010's CASE, and
-- lib/billing/plans.ts in sync). Unlike consume_ai_credits(), this never
-- takes a row lock unless the period has actually elapsed, so an ordinary
-- page view stays a cheap read in the common case.

create or replace function public.get_credit_balance(p_owner_id uuid)
returns public.credit_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.credit_balances;
  v_plan_id text;
  v_plan_allocation integer;
begin
  if not public.can_view_billing(p_owner_id) then
    raise exception 'Not authorized to view this billing account';
  end if;

  select * into v_balance from public.credit_balances where owner_id = p_owner_id;
  if not found then
    return null;
  end if;

  if now() < v_balance.period_end then
    return v_balance;
  end if;

  select plan_id into v_plan_id from public.subscriptions where owner_id = p_owner_id;
  v_plan_allocation := case coalesce(v_plan_id, 'free')
    when 'creator' then 85
    when 'pro' then 260
    else 10
  end;

  -- Optimistic: only roll over if the row's period_end still matches what
  -- we just read. If a concurrent consume_ai_credits() call (or another
  -- concurrent get_credit_balance() call) already rolled it over between
  -- our SELECT and this UPDATE, this affects 0 rows and we fall through to
  -- re-reading the now-current row below instead of clobbering it.
  update public.credit_balances
    set period_start = period_end,
        period_end = period_end + interval '1 month',
        monthly_allocation = v_plan_allocation,
        credits_used = 0,
        updated_at = now()
    where owner_id = p_owner_id
      and period_end = v_balance.period_end
    returning * into v_balance;

  if not found then
    select * into v_balance from public.credit_balances where owner_id = p_owner_id;
  end if;

  return v_balance;
end;
$$;

grant execute on function public.get_credit_balance(uuid) to authenticated;
