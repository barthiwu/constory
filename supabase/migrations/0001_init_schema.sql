-- =============================================================================
-- Constory V1 — Initial schema
-- =============================================================================
create extension if not exists "pgcrypto";

-- =============================================================================
-- profiles — extends auth.users
-- =============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per authenticated user, extending auth.users.';

-- =============================================================================
-- workspaces
-- =============================================================================
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  industry text,
  website text,
  primary_market text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_owner_id_idx on public.workspaces (owner_id);

-- =============================================================================
-- workspace_members
-- =============================================================================
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_workspace_id_idx on public.workspace_members (workspace_id);
create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);

-- =============================================================================
-- brand_profiles (1:1 with workspace)
-- =============================================================================
create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,

  business_description text not null default '',

  target_audience text not null default '',
  audience_type text,
  audience_locations text,
  audience_age_range text,
  audience_interests text,
  audience_problems text,

  brand_voice text not null default '',

  primary_goal text,
  secondary_goals jsonb not null default '[]'::jsonb,

  selected_platforms jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- products_services
-- =============================================================================
create table if not exists public.products_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text not null default '',
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_services_workspace_id_idx on public.products_services (workspace_id);

-- =============================================================================
-- content_strategies
-- =============================================================================
create table if not exists public.content_strategies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  strategy_summary text not null default '',
  monthly_theme text,
  content_mix jsonb not null default '[]'::jsonb,
  source text not null default 'AI' check (source in ('AI', 'USER', 'AI_EDITED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_strategies_workspace_id_idx on public.content_strategies (workspace_id);

-- =============================================================================
-- content_pillars
-- =============================================================================
create table if not exists public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.content_strategies (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text not null default '',
  recommended_percentage integer not null default 0 check (recommended_percentage >= 0 and recommended_percentage <= 100),
  source text not null default 'AI' check (source in ('AI', 'USER', 'AI_EDITED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_pillars_strategy_id_idx on public.content_pillars (strategy_id);
create index if not exists content_pillars_workspace_id_idx on public.content_pillars (workspace_id);

-- =============================================================================
-- content_calendars
-- =============================================================================
create table if not exists public.content_calendars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  posting_frequency integer not null default 3,
  selected_platforms jsonb not null default '[]'::jsonb,
  primary_goal text,
  campaign_name text,
  campaign_objective text,
  campaign_start_date date,
  campaign_end_date date,
  campaign_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_calendars_date_range check (end_date >= start_date)
);

create index if not exists content_calendars_workspace_id_idx on public.content_calendars (workspace_id);

-- =============================================================================
-- calendar_posts
-- =============================================================================
create table if not exists public.calendar_posts (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.content_calendars (id) on delete cascade,
  content_pillar_id uuid references public.content_pillars (id) on delete set null,

  scheduled_date date not null,
  platform text not null,
  title text not null default 'Untitled post',

  format text,
  objective text,

  brief text,
  hook text,
  caption text,
  cta text,
  hashtags jsonb not null default '[]'::jsonb,
  creative_direction text,

  status text not null default 'draft' check (status in ('draft', 'planned', 'completed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_posts_calendar_id_idx on public.calendar_posts (calendar_id);
create index if not exists calendar_posts_scheduled_date_idx on public.calendar_posts (scheduled_date);
create index if not exists calendar_posts_pillar_id_idx on public.calendar_posts (content_pillar_id);

-- =============================================================================
-- content_ideas
-- =============================================================================
create table if not exists public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_pillar_id uuid references public.content_pillars (id) on delete set null,
  title text not null,
  description text not null default '',
  source text not null default 'USER' check (source in ('AI', 'USER')),
  status text not null default 'active' check (status in ('active', 'used', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_ideas_workspace_id_idx on public.content_ideas (workspace_id);

-- =============================================================================
-- ai_generations — audit / status log for every AI call
-- =============================================================================
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  generation_type text not null check (
    generation_type in ('strategy', 'pillars', 'ideas', 'calendar', 'post', 'caption', 'regeneration')
  ),
  input_summary jsonb,
  output_summary jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_generations_workspace_id_idx on public.ai_generations (workspace_id);
create index if not exists ai_generations_user_id_idx on public.ai_generations (user_id);

-- =============================================================================
-- updated_at maintenance trigger
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'workspaces', 'brand_profiles', 'products_services',
    'content_strategies', 'content_pillars', 'content_calendars',
    'calendar_posts', 'content_ideas'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;
