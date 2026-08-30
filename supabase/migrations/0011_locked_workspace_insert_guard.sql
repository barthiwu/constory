-- Fixes HIGH Security Finding §2 in PHASE7_5_AUDIT_REPORT.md: a workspace
-- locked by a plan downgrade (workspaces.billing_locked = true, set by
-- lockExcessWorkspaces() in services/billing-service.ts) was checked in the
-- application layer (lib/billing/entitlements.ts's canCreatePillar,
-- canCreateCalendar, canCreateIdea, canUseAI) but NEVER at the RLS layer.
-- Any editor of a locked workspace could insert new content_pillars,
-- content_calendars, calendar_posts, or content_ideas rows directly via
-- PostgREST, completely bypassing the app-layer lock check the same way
-- migration 0010's CRITICAL finding bypassed the billing RPCs.
--
-- This migration adds `and not billing_locked` to the five INSERT policies
-- that create new content in a workspace, so the lock is enforced at the
-- database layer regardless of which client or code path performs the
-- write. It intentionally does NOT touch UPDATE/DELETE policies — a locked
-- workspace's *existing* content must remain viewable and editable (the
-- product only blocks *new* content while locked, per spec §27-28; a
-- locked workspace's owner can still, for example, fix a typo in an
-- existing post or reorder an existing calendar).

-- Reused by every insert policy below — a single, testable definition of
-- "this workspace is open for new writes right now."
create or replace function public.is_workspace_open_for_writes(target_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_workspace_editor(target_workspace_id)
    and not coalesce((select w.billing_locked from public.workspaces w where w.id = target_workspace_id), false);
$$;

-- content_strategies
drop policy if exists "content_strategies_insert_editor" on public.content_strategies;
create policy "content_strategies_insert_editor" on public.content_strategies
  for insert with check (public.is_workspace_open_for_writes(workspace_id));

-- content_pillars
drop policy if exists "content_pillars_insert_editor" on public.content_pillars;
create policy "content_pillars_insert_editor" on public.content_pillars
  for insert with check (
    public.is_workspace_open_for_writes(workspace_id)
    and workspace_id = public.strategy_workspace_id(strategy_id)
  );

-- content_calendars
drop policy if exists "content_calendars_insert_editor" on public.content_calendars;
create policy "content_calendars_insert_editor" on public.content_calendars
  for insert with check (public.is_workspace_open_for_writes(workspace_id));

-- calendar_posts — authorized via the parent calendar's workspace.
drop policy if exists "calendar_posts_insert_editor" on public.calendar_posts;
create policy "calendar_posts_insert_editor" on public.calendar_posts
  for insert with check (public.is_workspace_open_for_writes(public.calendar_workspace_id(calendar_id)));

-- content_ideas
drop policy if exists "content_ideas_insert_editor" on public.content_ideas;
create policy "content_ideas_insert_editor" on public.content_ideas
  for insert with check (public.is_workspace_open_for_writes(workspace_id));
