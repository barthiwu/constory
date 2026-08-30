\set ON_ERROR_STOP off
\pset pager off

-- =============================================================================
-- Phase 7.5: verifies billing/subscriptions/AI-credit infrastructure added by
-- migration 0008 — auto-provisioning, cross-account RLS isolation, the
-- atomic consume_ai_credits() guard (insufficient-credit rejection and the
-- sequential-contention case that stands in for true concurrency — see that
-- function's comment in the migration for why the row lock makes real
-- concurrent callers behave the same way), monthly period rollover, and
-- apply_plan_change()'s owner-only enforcement.
-- =============================================================================

\echo '--- Backfill: Alice and Bob (seeded directly into profiles, before this migration existed) each got a Free subscription + 10-credit balance (expect 2 rows each, plan_id=free / monthly_allocation=10, credits_used=0) ---'
select owner_id, plan_id, status, billing_interval from public.subscriptions
where owner_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
order by owner_id;

select owner_id, monthly_allocation, credits_used from public.credit_balances
where owner_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
order by owner_id;

-- =============================================================================
-- Fresh workspace for Alice to run credit-consumption scenarios against,
-- distinct from any workspace used by earlier numbered test scripts.
-- =============================================================================
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.workspaces (id, owner_id, name, industry)
values ('ffffff00-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice Billing Co', 'Retail');

reset role;

-- A brand-new third user with NO relationship to Alice at all — Bob is not
-- a usable "total stranger" for this section, since 03_viewer_role_test.sql
-- already made him a viewer on Alice's aaaaaaaa-... workspace earlier in
-- this same run, which would make can_view_billing() legitimately true for
-- him and defeat the point of this test.
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'carol@example.com') on conflict (id) do nothing;
insert into public.profiles (id, full_name) values ('33333333-3333-3333-3333-333333333333', 'Carol') on conflict (id) do nothing;

\echo '--- Carol also got auto-provisioned Free billing via the same backfill/trigger path (expect 1 row each) ---'
select plan_id from public.subscriptions where owner_id = '33333333-3333-3333-3333-333333333333';
select monthly_allocation from public.credit_balances where owner_id = '33333333-3333-3333-3333-333333333333';

\echo '=================================================================='
\echo 'RLS isolation: CAROL (a total stranger — not a member of any'
\echo 'workspace Alice owns) must not see Alice''s subscription, credit'
\echo 'balance, or usage ledger, and cannot write to any of them.'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

\echo '--- CAROL: SELECT Alice subscription (expect 0 rows) ---'
select plan_id from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- CAROL: SELECT Alice credit balance (expect 0 rows) ---'
select monthly_allocation from public.credit_balances where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- CAROL: attempt to directly UPDATE Alice subscription plan (expect UPDATE 0 — no policy permits this) ---'
update public.subscriptions set plan_id = 'pro' where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- CAROL: attempt to directly UPDATE Alice credit balance (expect UPDATE 0 — no write policy exists at all) ---'
update public.credit_balances set credits_used = 0, monthly_allocation = 999999 where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- CAROL: consume_ai_credits against Alice''s workspace she is not a member of (expect ok=false, reason=not_a_member) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_ideas', 2, 85);

reset role;

\echo '--- Verify Alice''s plan/allocation are unchanged after Carol''s attempts (expect plan_id=free, monthly_allocation=10) ---'
select plan_id from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
select monthly_allocation from public.credit_balances where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '=================================================================='
\echo 'A workspace MEMBER (Bob, already a viewer on Alice''s other'
\echo 'workspace since script 03) can view but not modify Alice''s'
\echo 'billing state — read access follows workspace membership, write'
\echo 'access is owner-only regardless of workspace role.'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

\echo '--- BOB (a member of a different Alice-owned workspace): SELECT Alice subscription (expect 1 row, plan_id=free) ---'
select plan_id from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- BOB: attempt to UPDATE Alice subscription (expect UPDATE 0 — is_billing_owner is false for him) ---'
update public.subscriptions set plan_id = 'pro' where owner_id = '11111111-1111-1111-1111-111111111111';

reset role;

\echo '=================================================================='
\echo 'consume_ai_credits: atomic deduct + ledger, insufficient-credit'
\echo 'rejection, and the sequential-contention guard.'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

\echo '--- ALICE: generate_ideas costs 2, she has 10 (expect ok=true, remaining=8) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_ideas', 2, 10);

\echo '--- Ledger row was written for that spend (expect 1 row: generate_ideas, 2 credits, success) ---'
select action_type, credits_used, request_status from public.ai_usage_ledger
where workspace_id = 'ffffff00-0000-0000-0000-000000000001' and owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- ALICE: generate_strategy costs 4, she has 8 remaining (expect ok=true, remaining=4) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_strategy', 4, 10);

\echo '--- ALICE: generate_calendar costs 4, she has exactly 4 remaining — this is the last request that can succeed (expect ok=true, remaining=0) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_calendar', 4, 10);

\echo '--- ALICE: one more credit requested with 0 remaining — this stands in for two requests racing over the last credit (whichever the database serializes second observes insufficient balance, exactly like this sequential call does) (expect ok=false, reason=insufficient_credits, remaining=0, monthly_allocation unchanged at 10) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_post', 1, 10);

\echo '--- A rejected request never wrote a ledger row or changed credits_used (expect credits_used=10, and still only 3 ledger rows total from the 3 successful spends above) ---'
select credits_used, monthly_allocation from public.credit_balances where owner_id = '11111111-1111-1111-1111-111111111111';
select count(*) as ledger_rows from public.ai_usage_ledger where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- A zero-credit "peek" (used by canUseAI''s pre-check) reports the balance without spending or logging anything (expect ok=true, remaining=0, no new ledger row) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', null, 0, 10);
select count(*) as ledger_rows_after_peek from public.ai_usage_ledger where owner_id = '11111111-1111-1111-1111-111111111111';

reset role;

\echo '=================================================================='
\echo 'Monthly period rollover: an elapsed period resets credits_used to 0'
\echo 'and adopts whatever plan allocation is passed in (spec §6-7).'
\echo '=================================================================='
update public.credit_balances
  set period_end = now() - interval '1 day'
  where owner_id = '11111111-1111-1111-1111-111111111111';

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

\echo '--- Next call after the period elapsed rolls over to the (now-upgraded) 85-credit allocation and a fresh 0 used (expect ok=true, remaining=83, monthly_allocation=85) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_ideas', 2, 85);

reset role;

\echo '--- credit_balances reflects the rollover directly (expect monthly_allocation=85, credits_used=2, period_end back in the future) ---'
select monthly_allocation, credits_used, (period_end > now()) as period_end_in_future from public.credit_balances
where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '=================================================================='
\echo 'apply_plan_change: only the account owner can change their own plan.'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

\echo '--- ALICE changes her own plan to Creator/annual (expect no error) ---'
select public.apply_plan_change(
  '11111111-1111-1111-1111-111111111111', 'creator', 'active', 'annual',
  now(), now() + interval '1 month', false, 85
);

select plan_id, billing_interval from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
select monthly_allocation, credits_used from public.credit_balances where owner_id = '11111111-1111-1111-1111-111111111111';

reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

\echo '--- BOB attempts apply_plan_change on Alice''s account (expect an error: Not authorized) ---'
select public.apply_plan_change(
  '11111111-1111-1111-1111-111111111111', 'pro', 'active', 'monthly',
  now(), now() + interval '1 month', false, 260
);

reset role;

\echo '--- Alice''s plan is unchanged by Bob''s attempt (expect plan_id=creator, still not pro) ---'
select plan_id from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
