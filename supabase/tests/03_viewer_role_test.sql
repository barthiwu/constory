\set ON_ERROR_STOP off
\pset pager off

-- As Alice (owner), grant Bob 'viewer' access to her workspace.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'viewer');
reset role;

-- As Bob (now a viewer of Alice's workspace):
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

\echo '--- BOB (viewer): can now SELECT Alice workspace (expect 1 row) ---'
select id, name from public.workspaces where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB (viewer): can now SELECT Alice brand_profiles (expect 1 row) ---'
select workspace_id from public.brand_profiles where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- BOB (viewer): attempt to INSERT a product into Alice workspace (expect ERROR — viewer is read-only) ---'
insert into public.products_services (workspace_id, name, description)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Viewer product', 'should be blocked');

\echo '--- BOB (viewer): attempt to UPDATE Alice workspace (expect UPDATE 0 — viewer is read-only) ---'
update public.workspaces set name = 'viewer-edited' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

reset role;

-- Duplicate membership test: re-adding Bob as viewer again should not create a second row (unique constraint + ON CONFLICT in app logic notwithstanding, the DB constraint itself must hold).
\echo '--- Duplicate workspace_members (workspace_id, user_id) rejected by unique constraint ---'
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'viewer');

\echo '--- Final membership count for Alice workspace (expect exactly 2: Alice owner + Bob viewer) ---'
select workspace_id, user_id, role from public.workspace_members where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by role;
