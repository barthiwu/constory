\set ON_ERROR_STOP off
\pset pager off

-- =============================================================================
-- As Alice: create a workspace, verify she becomes owner automatically,
-- then create brand profile / product / strategy / pillar / calendar / post /
-- idea / ai_generation rows under it.
-- =============================================================================
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.workspaces (id, owner_id, name, industry)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice Co', 'Retail');

\echo '--- ALICE: workspace_members after workspace insert (expect 1 row, role=owner) ---'
select workspace_id, user_id, role from public.workspace_members;

insert into public.brand_profiles (workspace_id, business_description, target_audience, brand_voice)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'We sell shoes', 'Runners', 'Bold');

insert into public.products_services (workspace_id, name, description)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Running shoes', 'Fast shoes');

insert into public.content_strategies (id, workspace_id, strategy_summary, source)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Focus on speed', 'USER');

insert into public.content_pillars (workspace_id, strategy_id, name, description, recommended_percentage, source)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'Product', 'Show the shoes', 40, 'USER');

insert into public.content_calendars (id, workspace_id, name, start_date, end_date)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'August', '2026-08-01', '2026-08-31');

insert into public.calendar_posts (calendar_id, scheduled_date, platform, title)
values ('aaaaaaaa-0000-0000-0000-000000000003', '2026-08-05', 'instagram', 'New drop');

insert into public.content_ideas (workspace_id, title, description)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Behind the scenes', 'Factory tour');

insert into public.ai_generations (workspace_id, user_id, generation_type, status)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'strategy', 'completed');

\echo '--- ALICE: can see her own workspace and everything under it (expect 1 each) ---'
select count(*) as workspaces from public.workspaces;
select count(*) as brand_profiles from public.brand_profiles;
select count(*) as products from public.products_services;
select count(*) as strategies from public.content_strategies;
select count(*) as pillars from public.content_pillars;
select count(*) as calendars from public.content_calendars;
select count(*) as posts from public.calendar_posts;
select count(*) as ideas from public.content_ideas;
select count(*) as ai_generations from public.ai_generations;

reset role;

-- =============================================================================
-- Now create Bob's own separate workspace as Bob (sanity: two independent
-- workspaces should coexist fine).
-- =============================================================================
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

insert into public.workspaces (id, owner_id, name, industry)
values ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Bob LLC', 'Consulting');

\echo '=================================================================='
\echo 'CROSS-USER ISOLATION TESTS (as Bob, targeting Alice''s data) — every'
\echo 'count below MUST be 0, and every write attempt MUST fail.'
\echo '=================================================================='

\echo '--- BOB: workspaces visible (expect exactly 1 — his own, not Alice''s) ---'
select id, name from public.workspaces;

\echo '--- BOB: SELECT Alice''s workspace directly by id (expect 0 rows) ---'
select * from public.workspaces where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB: SELECT Alice''s brand_profiles (expect 0 rows) ---'
select * from public.brand_profiles where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB: SELECT Alice''s products_services (expect 0 rows) ---'
select * from public.products_services where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB: SELECT Alice''s content_strategies (expect 0 rows) ---'
select * from public.content_strategies where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB: SELECT Alice''s content_pillars (expect 0 rows) ---'
select * from public.content_pillars where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB: SELECT Alice''s content_calendars (expect 0 rows) ---'
select * from public.content_calendars where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB: SELECT Alice''s calendar_posts (expect 0 rows) ---'
select * from public.calendar_posts where calendar_id = 'aaaaaaaa-0000-0000-0000-000000000003';

\echo '--- BOB: SELECT Alice''s content_ideas (expect 0 rows) ---'
select * from public.content_ideas where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB: SELECT Alice''s ai_generations (expect 0 rows) ---'
select * from public.ai_generations where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB: SELECT Alice''s profile row (expect 0 rows) ---'
select * from public.profiles where id = '11111111-1111-1111-1111-111111111111';

\echo '--- BOB: attempt to UPDATE Alice''s workspace name (expect UPDATE 0) ---'
update public.workspaces set name = 'HACKED' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB: attempt to DELETE Alice''s calendar post (expect DELETE 0) ---'
delete from public.calendar_posts where calendar_id = 'aaaaaaaa-0000-0000-0000-000000000003';

\echo '--- BOB: attempt to INSERT a brand_profile INTO Alice''s workspace (expect ERROR: RLS policy violation) ---'
insert into public.brand_profiles (workspace_id, business_description, target_audience, brand_voice)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Hacked business', 'Nobody', 'None');

\echo '--- BOB: attempt to INSERT into Alice''s workspace_members to add himself (expect ERROR: RLS policy violation) ---'
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

\echo '--- BOB: verify Alice''s data is completely untouched after all attacks ---'
reset role;
select id, name from public.workspaces where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select count(*) from public.calendar_posts where calendar_id = 'aaaaaaaa-0000-0000-0000-000000000003';
select count(*) from public.workspace_members where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';
