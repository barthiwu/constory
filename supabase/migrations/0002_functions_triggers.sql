-- =============================================================================
-- Constory V1 — Functions & triggers
-- =============================================================================

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-add the creating user as 'owner' in workspace_members whenever a workspace is created.
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- =============================================================================
-- Helper functions used by RLS policies.
-- SECURITY DEFINER + a fixed search_path avoids recursive-RLS evaluation
-- and search_path hijacking when these are called from policy expressions.
-- =============================================================================

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.workspace_role(target_workspace_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_workspace_editor(target_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin', 'editor')
  );
$$;

-- Resolve a calendar's workspace_id in one place, reused by calendar_posts policies.
create or replace function public.calendar_workspace_id(target_calendar_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select workspace_id from public.content_calendars where id = target_calendar_id;
$$;

-- Resolve a strategy's workspace_id, reused by content_pillars policies.
create or replace function public.strategy_workspace_id(target_strategy_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select workspace_id from public.content_strategies where id = target_strategy_id;
$$;
