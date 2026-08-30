-- Phase 5 correction: persist AI idea metadata.
--
-- The AI ideas generator (lib/ai/generate-ideas.ts / aiIdeaSchema) has always
-- produced a recommended_platform, recommended_format, content_objective and
-- suggested_hook alongside each idea's title/description, and the review
-- screen (components/content/ideas-view.tsx) already shows all four while
-- the draft is on screen. But content_ideas never had columns for them, so
-- saveGeneratedIdeasAction silently dropped everything except
-- title/description/content_pillar_id the moment a user clicked Save — the
-- one confirmed Phase 5 gap. This adds the missing columns so accepted
-- metadata survives past the review step.
--
-- All four columns are nullable with no default beyond NULL: they are
-- optional context, not required fields, so every pre-existing idea (and
-- every future manually-created idea with none of this filled in) remains
-- perfectly valid. Free-text columns (not enums/check constraints) are used
-- deliberately, mirroring calendar_posts.platform/format/objective/hook,
-- which are also free text — this keeps the new idea metadata consistent
-- with the existing, working calendar_posts convention rather than
-- inventing a second validation scheme.
alter table public.content_ideas
  add column if not exists recommended_platform text,
  add column if not exists recommended_format text,
  add column if not exists content_objective text,
  add column if not exists suggested_hook text;

comment on column public.content_ideas.recommended_platform is
  'Optional AI-recommended platform for this idea (e.g. instagram, linkedin) — same value space as calendar_posts.platform. User-editable, not locked once accepted.';
comment on column public.content_ideas.recommended_format is
  'Optional AI-recommended content format (see CONTENT_FORMAT_OPTIONS in lib/constants.ts) — same value space as calendar_posts.format. User-editable.';
comment on column public.content_ideas.content_objective is
  'Optional AI-suggested content objective (e.g. "Educate", "Engage", "Promote") — same value space as calendar_posts.objective. User-editable.';
comment on column public.content_ideas.suggested_hook is
  'Optional AI-suggested opening hook/angle for this idea — same value space as calendar_posts.hook. User-editable.';
