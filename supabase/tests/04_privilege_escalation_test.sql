\set ON_ERROR_STOP off
\pset pager off

-- Bob is already a 'viewer' member of Alice's workspace (added by
-- 03_viewer_role_test.sql). Confirm he cannot promote himself.

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

\echo '--- BOB: attempt to update own workspace_members row to role=owner (expect UPDATE 0 — only the workspace owner may change roles) ---'
update public.workspace_members
set role = 'owner'
where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  and user_id = '22222222-2222-2222-2222-222222222222';

\echo '--- BOB: attempt to update own workspace_members row to role=admin (expect UPDATE 0) ---'
update public.workspace_members
set role = 'admin'
where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  and user_id = '22222222-2222-2222-2222-222222222222';

\echo '--- BOB: attempt to insert a second membership row for himself as owner (expect ERROR: unique violation or RLS policy violation) ---'
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

reset role;

\echo '--- Verify Bob is still exactly "viewer" on Alice''s workspace after every escalation attempt ---'
select workspace_id, user_id, role from public.workspace_members
where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  and user_id = '22222222-2222-2222-2222-222222222222';
