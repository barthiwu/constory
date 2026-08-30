-- Phase 4 correction: structured brand voice.
--
-- brand_profiles.brand_voice was a single flattened text column doing double
-- duty for both preset voice traits (e.g. "Professional", "Friendly") and a
-- free-text custom description, joined together client-side with ". " and
-- parsed back apart with a fragile regex on read. This adds a proper array
-- column for the preset traits so the two concepts are stored distinctly;
-- brand_voice keeps its existing name/column and going forward holds only
-- the free-text custom description.
--
-- Non-destructive: brand_voice is untouched (no data loss for existing
-- rows), and the new column defaults to an empty array so every existing
-- workspace keeps whatever was already in brand_voice, readable exactly as
-- it was.
alter table public.brand_profiles
  add column if not exists brand_voice_traits jsonb not null default '[]'::jsonb;

comment on column public.brand_profiles.brand_voice_traits is
  'Array of preset brand-voice trait values (see VOICE_OPTIONS in lib/constants.ts). brand_voice holds the free-text custom description only.';
