-- Simulates a workspace + brand profile that already existed BEFORE migration
-- 0005 (onboarding progress tracking) was applied — i.e. a real, already-
-- onboarded user from before this correction task. Run this AFTER migrations
-- 0001-0004 but BEFORE migration 0005, so 0005's backfill step has real data
-- to act on. Inserted as service_role to bypass RLS/triggers ordering concerns.

set role service_role;

insert into public.workspaces (id, owner_id, name, industry)
values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Legacy Workspace', 'Consulting')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner')
on conflict (workspace_id, user_id) do nothing;

insert into public.brand_profiles (workspace_id, business_description, target_audience, brand_voice)
values ('dddddddd-0000-0000-0000-000000000001', 'A pre-existing, already-onboarded business', 'Existing customers', 'Professional')
on conflict (workspace_id) do nothing;

reset role;
