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
--
-- Also verifies migration 0010's fix for the price/credit-authority bypass
-- the independent Phase 7.5 audit found (PHASE7_5_AUDIT_REPORT.md, Security
-- Findings §1): that neither the account owner nor anyone else can grant
-- themselves a plan/credit change by calling the database directly (table
-- UPDATE or RPC) as `authenticated` — only the service role can, simulating
-- the admin client that trusted server code now uses for this.
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

\echo '--- CAROL: attempt to directly UPDATE Alice subscription plan (expect an error — not the row owner, and plan_id is outside her column grant anyway) ---'
update public.subscriptions set plan_id = 'pro' where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- CAROL: attempt to directly UPDATE Alice credit balance (expect UPDATE 0 — no write policy exists at all) ---'
update public.credit_balances set credits_used = 0, monthly_allocation = 999999 where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- CAROL: consume_ai_credits against Alice''s workspace she is not a member of (expect ok=false, reason=not_a_member) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_ideas', 2);

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
\echo 'SELF-ESCALATION (migration 0010 / audit Security Findings §1): even'
\echo 'the account OWNER must not be able to grant herself a paid plan,'
\echo 'inflated credits, or self-reverse a downgrade lock by writing to'
\echo 'these tables directly (PostgREST table UPDATE) instead of going'
\echo 'through server-verified payment/business logic. Only'
\echo 'cancel_at_period_end (a genuinely safe self-service action) should'
\echo 'remain directly writable.'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

\echo '--- ALICE (the real owner): attempt to directly UPDATE her own plan_id to pro (expect an ERROR — permission denied for column plan_id, not just an RLS no-op) ---'
update public.subscriptions set plan_id = 'pro' where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- ALICE: attempt to directly UPDATE her own current_period_end to 100 years out (expect an ERROR — same reason) ---'
update public.subscriptions set current_period_end = now() + interval '100 years' where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- ALICE: the one column she IS allowed to self-service (cancel_at_period_end) still works (expect UPDATE 1, no error) ---'
update public.subscriptions set cancel_at_period_end = true where owner_id = '11111111-1111-1111-1111-111111111111';
update public.subscriptions set cancel_at_period_end = false where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- ALICE: attempt to directly UPDATE credit_balances (expect an ERROR — no write policy for authenticated at all, unchanged from before) ---'
update public.credit_balances set monthly_allocation = 999999999 where owner_id = '11111111-1111-1111-1111-111111111111';

reset role;

\echo '--- Verify none of Alice''s self-escalation attempts changed anything (expect plan_id=free, monthly_allocation=10, cancel_at_period_end=false) ---'
select plan_id, cancel_at_period_end from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
select monthly_allocation from public.credit_balances where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- Same self-escalation check on workspaces.billing_locked: ALICE attempts to directly unlock her own workspace (expect an ERROR — permission denied for column billing_locked) ---'
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update public.workspaces set billing_locked = false where id = 'ffffff00-0000-0000-0000-000000000001';
\echo '--- ALICE: the fields she IS allowed to self-service (e.g. name) still work (expect UPDATE 1, no error) ---'
update public.workspaces set name = 'Alice Billing Co (renamed)' where id = 'ffffff00-0000-0000-0000-000000000001';
reset role;

\echo '=================================================================='
\echo 'consume_ai_credits: atomic deduct + ledger, insufficient-credit'
\echo 'rejection, and the sequential-contention guard. The allocation is'
\echo 'now resolved server-side from subscriptions.plan_id (migration'
\echo '0010) rather than trusted from the caller — Alice is still on Free'
\echo '(10 credits) at this point in the script.'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

\echo '--- ALICE: generate_ideas costs 2, she has 10 (expect ok=true, remaining=8) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_ideas', 2);

\echo '--- Ledger row was written for that spend (expect 1 row: generate_ideas, 2 credits, success) ---'
select action_type, credits_used, request_status from public.ai_usage_ledger
where workspace_id = 'ffffff00-0000-0000-0000-000000000001' and owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- ALICE: generate_strategy costs 4, she has 8 remaining (expect ok=true, remaining=4) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_strategy', 4);

\echo '--- ALICE: generate_calendar costs 4, she has exactly 4 remaining — this is the last request that can succeed (expect ok=true, remaining=0) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_calendar', 4);

\echo '--- ALICE: one more credit requested with 0 remaining — this stands in for two requests racing over the last credit (whichever the database serializes second observes insufficient balance, exactly like this sequential call does) (expect ok=false, reason=insufficient_credits, remaining=0, monthly_allocation unchanged at 10) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_post', 1);

\echo '--- A rejected request never wrote a ledger row or changed credits_used (expect credits_used=10, and still only 3 ledger rows total from the 3 successful spends above) ---'
select credits_used, monthly_allocation from public.credit_balances where owner_id = '11111111-1111-1111-1111-111111111111';
select count(*) as ledger_rows from public.ai_usage_ledger where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- A zero-credit "peek" (used by canUseAI''s pre-check) reports the balance without spending or logging anything (expect ok=true, remaining=0, no new ledger row) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', null, 0);
select count(*) as ledger_rows_after_peek from public.ai_usage_ledger where owner_id = '11111111-1111-1111-1111-111111111111';

reset role;

\echo '=================================================================='
\echo 'Monthly period rollover: an elapsed period resets credits_used to 0'
\echo 'and adopts the account''s CURRENT plan''s allocation, resolved from'
\echo 'subscriptions.plan_id inside the function (spec §6-7; migration'
\echo '0010 — this is no longer a caller-supplied parameter). Simulating'
\echo 'Alice having upgraded to Creator (85 credits) via the trusted'
\echo 'server path (a direct table write here, as the test-harness'
\echo 'superuser, standing in for what apply_plan_change() does via the'
\echo 'admin client — that RPC itself is exercised end-to-end below).'
\echo '=================================================================='
update public.subscriptions
  set plan_id = 'creator'
  where owner_id = '11111111-1111-1111-1111-111111111111';

update public.credit_balances
  set period_end = now() - interval '1 day'
  where owner_id = '11111111-1111-1111-1111-111111111111';

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

\echo '--- Next call after the period elapsed rolls over to the (now-Creator) 85-credit allocation and a fresh 0 used (expect ok=true, remaining=83, monthly_allocation=85) ---'
select * from public.consume_ai_credits('ffffff00-0000-0000-0000-000000000001', 'generate_ideas', 2);

reset role;

\echo '--- credit_balances reflects the rollover directly (expect monthly_allocation=85, credits_used=2, period_end back in the future) ---'
select monthly_allocation, credits_used, (period_end > now()) as period_end_in_future from public.credit_balances
where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '=================================================================='
\echo 'apply_plan_change (migration 0010): callable ONLY by the service'
\echo 'role now — not by the account owner, not by anyone else, as'
\echo '`authenticated`. This is the direct fix for the CRITICAL finding'
\echo 'in PHASE7_5_AUDIT_REPORT.md — the function used to be reachable by'
\echo 'any signed-in user via direct RPC with an arbitrary plan/credit'
\echo 'allocation.'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

\echo '--- ALICE (the real owner, as `authenticated`): attempt apply_plan_change on her OWN account (expect an ERROR — permission denied for function apply_plan_change; owner-ness no longer matters, only the service role may call this at all) ---'
select public.apply_plan_change(
  '11111111-1111-1111-1111-111111111111', 'pro', 'active', 'annual',
  now(), now() + interval '1 year', false, 999999999
);

reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

\echo '--- BOB (as `authenticated`) attempts apply_plan_change on Alice''s account (expect an ERROR — same reason: no EXECUTE grant for authenticated at all) ---'
select public.apply_plan_change(
  '11111111-1111-1111-1111-111111111111', 'pro', 'active', 'monthly',
  now(), now() + interval '1 month', false, 260
);

reset role;

\echo '--- Alice''s plan is unchanged by either direct-RPC attempt (expect plan_id=creator, still not pro, still not the 999999999 allocation) ---'
select plan_id from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
select monthly_allocation from public.credit_balances where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '--- The SERVICE ROLE (simulating the Next.js admin client, invoked only from trusted server code after payment verification or the no-payment Manual-provider decision) CAN call apply_plan_change (expect no error, plan_id becomes pro) ---'
set role service_role;
select public.apply_plan_change(
  '11111111-1111-1111-1111-111111111111', 'pro', 'active', 'annual',
  now(), now() + interval '1 year', false, 260
);
reset role;

select plan_id, billing_interval from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
select monthly_allocation, credits_used from public.credit_balances where owner_id = '11111111-1111-1111-1111-111111111111';

\echo '=================================================================='
\echo 'LOCKED WORKSPACE (migration 0011 / audit Security Findings §2): a'
\echo 'workspace with billing_locked=true must reject new'
\echo 'content_strategies/content_pillars/content_calendars/calendar_posts/'
\echo 'content_ideas rows at the RLS layer, even for its own owner/editor —'
\echo 'not just via the app-layer entitlement checks. Existing rows (a'
\echo 'pre-existing strategy/calendar seeded below before locking) stay'
\echo 'insertable-into via calendar_posts only after unlocking, proving the'
\echo 'block is specific to the lock, not a general breakage.'
\echo '=================================================================='

-- Seed one pre-existing strategy + calendar (as the test-harness superuser,
-- standing in for content saved before the workspace was ever locked) so
-- content_pillars/calendar_posts inserts below have a real parent row to
-- reference — those two tables' insert policies check the parent's
-- workspace_id, not just presence of billing_locked.
insert into public.content_strategies (id, workspace_id, strategy_summary, source)
values ('ffffff00-0000-0000-0000-0000000000a1', 'ffffff00-0000-0000-0000-000000000001', 'Pre-lock strategy', 'USER');

insert into public.content_calendars (id, workspace_id, name, start_date, end_date)
values ('ffffff00-0000-0000-0000-0000000000b1', 'ffffff00-0000-0000-0000-000000000001', 'Pre-lock calendar', '2026-01-01', '2026-01-31');

update public.workspaces set billing_locked = true where id = 'ffffff00-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

\echo '--- ALICE (owner/editor of her own LOCKED workspace): insert content_strategies (expect ERROR — RLS policy violation) ---'
insert into public.content_strategies (workspace_id, strategy_summary, source)
values ('ffffff00-0000-0000-0000-000000000001', 'Locked-out strategy', 'USER');

\echo '--- ALICE: insert content_pillars under the pre-existing strategy (expect ERROR) ---'
insert into public.content_pillars (strategy_id, workspace_id, name)
values ('ffffff00-0000-0000-0000-0000000000a1', 'ffffff00-0000-0000-0000-000000000001', 'Locked-out pillar');

\echo '--- ALICE: insert content_calendars (expect ERROR) ---'
insert into public.content_calendars (workspace_id, name, start_date, end_date)
values ('ffffff00-0000-0000-0000-000000000001', 'Locked-out calendar', '2026-02-01', '2026-02-28');

\echo '--- ALICE: insert calendar_posts under the pre-existing calendar (expect ERROR) ---'
insert into public.calendar_posts (calendar_id, scheduled_date, platform, title)
values ('ffffff00-0000-0000-0000-0000000000b1', '2026-01-05', 'instagram', 'Locked-out post');

\echo '--- ALICE: insert content_ideas (expect ERROR) ---'
insert into public.content_ideas (workspace_id, title)
values ('ffffff00-0000-0000-0000-000000000001', 'Locked-out idea');

reset role;

\echo '--- Confirm none of the locked-workspace insert attempts landed (expect 0 rows each beyond the pre-lock seed) ---'
select count(*) as strategies from public.content_strategies where workspace_id = 'ffffff00-0000-0000-0000-000000000001';
select count(*) as pillars from public.content_pillars where workspace_id = 'ffffff00-0000-0000-0000-000000000001';
select count(*) as calendars from public.content_calendars where workspace_id = 'ffffff00-0000-0000-0000-000000000001';
select count(*) as posts from public.calendar_posts where calendar_id = 'ffffff00-0000-0000-0000-0000000000b1';
select count(*) as ideas from public.content_ideas where workspace_id = 'ffffff00-0000-0000-0000-000000000001';

\echo '--- Unlocking (as the trusted server path would, via the admin client — simulated here as superuser) restores the ability to insert new content (expect all INSERT 1, no errors) ---'
update public.workspaces set billing_locked = false where id = 'ffffff00-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.content_strategies (workspace_id, strategy_summary, source)
values ('ffffff00-0000-0000-0000-000000000001', 'Unlocked strategy', 'USER');

insert into public.content_pillars (strategy_id, workspace_id, name)
values ('ffffff00-0000-0000-0000-0000000000a1', 'ffffff00-0000-0000-0000-000000000001', 'Unlocked pillar');

insert into public.content_calendars (workspace_id, name, start_date, end_date)
values ('ffffff00-0000-0000-0000-000000000001', 'Unlocked calendar', '2026-02-01', '2026-02-28');

insert into public.calendar_posts (calendar_id, scheduled_date, platform, title)
values ('ffffff00-0000-0000-0000-0000000000b1', '2026-01-06', 'instagram', 'Unlocked post');

insert into public.content_ideas (workspace_id, title)
values ('ffffff00-0000-0000-0000-000000000001', 'Unlocked idea');

reset role;

\echo '--- Confirm the unlocked inserts landed (expect 2 strategies, 1 pillar, 2 calendars, 1 post, 1 idea) ---'
select count(*) as strategies from public.content_strategies where workspace_id = 'ffffff00-0000-0000-0000-000000000001';
select count(*) as pillars from public.content_pillars where workspace_id = 'ffffff00-0000-0000-0000-000000000001';
select count(*) as calendars from public.content_calendars where workspace_id = 'ffffff00-0000-0000-0000-000000000001';
select count(*) as posts from public.calendar_posts where calendar_id = 'ffffff00-0000-0000-0000-0000000000b1';
select count(*) as ideas from public.content_ideas where workspace_id = 'ffffff00-0000-0000-0000-000000000001';

\echo '=================================================================='
\echo 'get_credit_balance lazy rollover (migration 0012 / audit Security'
\echo 'Findings §3): a page that only READS the balance must never show a'
\echo 'stale, already-elapsed period — it rolls over the same way'
\echo 'consume_ai_credits does, resolving the allocation from the'
\echo 'account''s CURRENT plan_id (Alice is on pro/260 at this point).'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

\echo '--- ALICE: get_credit_balance with a period still in the future is a no-op read (expect monthly_allocation=260, credits_used=0) ---'
select monthly_allocation, credits_used from public.get_credit_balance('11111111-1111-1111-1111-111111111111');

reset role;

\echo '--- CAROL (a total stranger, not authorized to view Alice''s billing at all): get_credit_balance on Alice''s account (expect an ERROR) ---'
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select monthly_allocation from public.get_credit_balance('11111111-1111-1111-1111-111111111111');
reset role;

-- Force the period into the past, as the test-harness superuser, standing
-- in for time having simply passed.
update public.credit_balances set period_end = now() - interval '1 day' where owner_id = '11111111-1111-1111-1111-111111111111';

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

\echo '--- BOB (a workspace member, not the owner — read access per can_view_billing) reads Alice''s balance after her period has elapsed: the rollover fires for him too, exactly as it would for consume_ai_credits (expect monthly_allocation=260, credits_used=0, period in the future) ---'
select monthly_allocation, credits_used, (period_end > now()) as period_end_in_future from public.get_credit_balance('11111111-1111-1111-1111-111111111111');

reset role;

\echo '--- credit_balances reflects the rollover directly (expect monthly_allocation=260, credits_used=0, period_end back in the future) ---'
select monthly_allocation, credits_used, (period_end > now()) as period_end_in_future from public.credit_balances
where owner_id = '11111111-1111-1111-1111-111111111111';
