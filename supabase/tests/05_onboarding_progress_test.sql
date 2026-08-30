\set ON_ERROR_STOP off
\pset pager off

-- =============================================================================
-- Verifies the onboarding_step / onboarding_completed columns added in
-- migration 0005 behave the way the app relies on for true progress
-- persistence and resumption.
-- =============================================================================

\echo '--- New workspaces default to onboarding_step=0, onboarding_completed=false ---'
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.workspaces (id, owner_id, name, industry)
values ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice New Co', 'Fitness');

select id, onboarding_step, onboarding_completed from public.workspaces
where id = 'cccccccc-0000-0000-0000-000000000001';

\echo '--- Alice (owner/member) can advance her own onboarding progress ---'
update public.workspaces set onboarding_step = 3 where id = 'cccccccc-0000-0000-0000-000000000001';
select id, onboarding_step from public.workspaces where id = 'cccccccc-0000-0000-0000-000000000001';

\echo '--- The step-range check constraint rejects an out-of-range step (expect ERROR) ---'
update public.workspaces set onboarding_step = 99 where id = 'cccccccc-0000-0000-0000-000000000001';

\echo '--- Alice marks onboarding complete ---'
update public.workspaces set onboarding_completed = true, onboarding_step = 7 where id = 'cccccccc-0000-0000-0000-000000000001';
select id, onboarding_step, onboarding_completed from public.workspaces where id = 'cccccccc-0000-0000-0000-000000000001';

reset role;

\echo '=================================================================='
\echo 'BOB (not a member of cccccccc-...-000000000001) must not be able to'
\echo 'read or advance Alice''s onboarding progress.'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

\echo '--- BOB: SELECT Alice''s new workspace onboarding fields (expect 0 rows) ---'
select onboarding_step, onboarding_completed from public.workspaces where id = 'cccccccc-0000-0000-0000-000000000001';

\echo '--- BOB: attempt to reset Alice''s onboarding progress (expect UPDATE 0) ---'
update public.workspaces set onboarding_step = 0, onboarding_completed = false
where id = 'cccccccc-0000-0000-0000-000000000001';

reset role;

\echo '--- Verify Alice''s onboarding_completed is still true after Bob''s attempt ---'
select id, onboarding_step, onboarding_completed from public.workspaces where id = 'cccccccc-0000-0000-0000-000000000001';

-- =============================================================================
-- Backfill correctness: "Legacy Workspace" (dddddddd-...-000000000001) was
-- inserted by 01b_legacy_workspace_fixture.sql BEFORE migration 0005 ran, with
-- a real brand profile already attached — simulating a workspace that was
-- already onboarded prior to this correction task. Migration 0005's backfill
-- must have marked it onboarding_completed=true, not left it needing
-- onboarding again (which would incorrectly send an existing user back into
-- the wizard).
-- =============================================================================
\echo '--- Backfill check: pre-existing workspace with a real brand profile is marked onboarding_completed=true ---'
select id, name, onboarding_step, onboarding_completed from public.workspaces
where id = 'dddddddd-0000-0000-0000-000000000001';
