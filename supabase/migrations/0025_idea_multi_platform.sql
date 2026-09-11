-- =============================================================================
-- Constory V1 — content_ideas.recommended_platform (single text) ->
-- recommended_platforms (text[]). A single idea routinely suits more than
-- one platform at once (e.g. a client story that works as an Instagram
-- carousel AND a LinkedIn post) — the old single-value column forced
-- picking just one recommendation, and (more importantly) meant the actual
-- "which platforms should this go out on" decision had nowhere to hold more
-- than one answer even after the idea became a real post.
--
-- calendar_posts.platform stays a single text column per row on purpose —
-- see services/content-service.ts's addIdeaToCalendar: turning an idea into
-- posts for N platforms creates N post rows, one per platform, each
-- independently editable. This migration only widens the IDEA's own
-- recommendation, not the post schema.
-- =============================================================================

alter table public.content_ideas
  add column if not exists recommended_platforms text[] not null default '{}';

update public.content_ideas
set recommended_platforms = array[recommended_platform]
where recommended_platform is not null and recommended_platforms = '{}';

alter table public.content_ideas
  drop column if exists recommended_platform;

comment on column public.content_ideas.recommended_platforms is
  'Zero or more AI-recommended (or user-picked) platforms for this idea — same value space as calendar_posts.platform. User-editable, not locked once accepted.';
