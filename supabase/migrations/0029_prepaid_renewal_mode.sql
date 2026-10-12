-- =============================================================================
-- Constory V1 -- prepaid (bank transfer) plans.
--
-- Card subscriptions renew themselves through Paystack. A bank transfer is a
-- one-off payment: Paystack gives the customer a single-use account number, and
-- there is no reusable token to bill again. A plan paid that way runs for the
-- period that was paid for and then drops to Free unless the customer pays again.
--
-- `renewal_mode` records which kind of plan this is, so the app knows
--   * "Keep my plan" can't be offered (nothing can renew it),
--   * a Paystack `subscription.disable` webhook must not mark it cancelled,
--   * the billing page should say "Renew" instead of "Keep my plan".
-- Existing rows are all card/auto-renewing, hence the default.
-- =============================================================================

alter table public.subscriptions
  add column if not exists renewal_mode text not null default 'auto'
    check (renewal_mode in ('auto', 'manual'));

-- Migration 0020 replaced the table-wide SELECT with a column list, so a new column
-- has to be granted explicitly. (Not sensitive: it only says how the plan renews.)
grant select (renewal_mode) on public.subscriptions to authenticated;

-- Free never renews anything, so it can't be "manual" either. Keeping this in the database
-- means no code path (RPC, lazy resolution, manual provider) can leave a stale 'manual' behind.
create or replace function public.subscriptions_reset_renewal_mode_on_free()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.plan_id = 'free' then
    new.renewal_mode := 'auto';
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_reset_renewal_mode_on_free on public.subscriptions;
create trigger subscriptions_reset_renewal_mode_on_free
  before insert or update on public.subscriptions
  for each row execute function public.subscriptions_reset_renewal_mode_on_free();
