\set ON_ERROR_STOP off
\pset pager off

-- =============================================================================
-- Phase 5 correction: verifies the recommended_platforms / recommended_format /
-- content_objective / suggested_hook columns on content_ideas (recommended_platforms
-- widened from a single text column to text[] by migration 0025) behave the way
-- the app relies on — optional/empty or populated (both stay valid), and covered
-- by the same RLS policy as the rest of the row (no separate column-level policy
-- was added, since none was needed).
-- =============================================================================

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.workspaces (id, owner_id, name, industry)
values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alice Metadata Co', 'Retail');

\echo '--- A manually-created idea with none of the new metadata columns set still inserts fine (expect 1 row, recommended_platforms {}, the rest NULL) ---'
insert into public.content_ideas (id, workspace_id, title, description, source)
values ('eeeeeeee-1111-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'Manual idea, no metadata', 'A plain idea with no AI metadata at all', 'USER');

select title, recommended_platforms, recommended_format, content_objective, suggested_hook
from public.content_ideas where id = 'eeeeeeee-1111-0000-0000-000000000001';

\echo '--- An AI-sourced idea with every metadata field populated (including multiple platforms) inserts and reads back exactly (expect 1 row, all columns populated) ---'
insert into public.content_ideas
  (id, workspace_id, title, description, source, recommended_platforms, recommended_format, content_objective, suggested_hook)
values
  ('eeeeeeee-1111-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'AI idea, full metadata', 'Generated with recommendations', 'AI',
   array['instagram', 'linkedin'], 'Carousel', 'Brand Awareness', 'Most businesses are making this mistake...');

select title, recommended_platforms, recommended_format, content_objective, suggested_hook
from public.content_ideas where id = 'eeeeeeee-1111-0000-0000-000000000002';

\echo '--- Accepted metadata is user-editable after the fact, not locked because it came from AI (expect UPDATE 1) ---'
update public.content_ideas
set recommended_platforms = array['linkedin'], content_objective = 'Educate'
where id = 'eeeeeeee-1111-0000-0000-000000000002';

select recommended_platforms, content_objective from public.content_ideas where id = 'eeeeeeee-1111-0000-0000-000000000002';

reset role;

\echo '=================================================================='
\echo 'BOB (not a member of eeeeeeee-...-000000000001) must not be able to'
\echo 'read Alice''s idea metadata — same RLS policy as the rest of the row.'
\echo '=================================================================='
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

\echo '--- BOB: SELECT Alice''s idea metadata (expect 0 rows) ---'
select recommended_platforms, suggested_hook from public.content_ideas where workspace_id = 'eeeeeeee-0000-0000-0000-000000000001';

\echo '--- BOB: attempt to overwrite Alice''s idea metadata (expect UPDATE 0) ---'
update public.content_ideas set recommended_platforms = array['hacked'] where workspace_id = 'eeeeeeee-0000-0000-0000-000000000001';

reset role;

\echo '--- Verify Alice''s idea metadata is unchanged after Bob''s attempt ---'
select recommended_platforms from public.content_ideas where id = 'eeeeeeee-1111-0000-0000-000000000002';
