-- =============================================================================
-- Constory V1 — Row Level Security
--
-- Every workspace-owned table is locked to members of that workspace only.
-- Reads require membership; writes require an editor-or-above role
-- (owner, admin, editor — viewer is read-only). The frontend is never trusted
-- for authorization: these policies are the actual enforcement boundary.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.products_services enable row level security;
alter table public.content_strategies enable row level security;
alter table public.content_pillars enable row level security;
alter table public.content_calendars enable row level security;
alter table public.calendar_posts enable row level security;
alter table public.content_ideas enable row level security;
alter table public.ai_generations enable row level security;

-- =============================================================================
-- profiles — a user can read/update only their own profile row.
-- =============================================================================
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

-- =============================================================================
-- workspaces
-- =============================================================================
create policy "workspaces_select_member" on public.workspaces
  for select using (public.is_workspace_member(id));

create policy "workspaces_insert_owner" on public.workspaces
  for insert with check (owner_id = auth.uid());

create policy "workspaces_update_editor" on public.workspaces
  for update using (public.is_workspace_editor(id)) with check (public.is_workspace_editor(id));

create policy "workspaces_delete_owner" on public.workspaces
  for delete using (owner_id = auth.uid());

-- =============================================================================
-- workspace_members
-- =============================================================================
create policy "workspace_members_select_member" on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));

create policy "workspace_members_insert_owner" on public.workspace_members
  for insert with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

create policy "workspace_members_update_owner" on public.workspace_members
  for update using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

create policy "workspace_members_delete_owner" on public.workspace_members
  for delete using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

-- =============================================================================
-- brand_profiles
-- =============================================================================
create policy "brand_profiles_select_member" on public.brand_profiles
  for select using (public.is_workspace_member(workspace_id));

create policy "brand_profiles_insert_editor" on public.brand_profiles
  for insert with check (public.is_workspace_editor(workspace_id));

create policy "brand_profiles_update_editor" on public.brand_profiles
  for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));

create policy "brand_profiles_delete_editor" on public.brand_profiles
  for delete using (public.is_workspace_editor(workspace_id));

-- =============================================================================
-- products_services
-- =============================================================================
create policy "products_services_select_member" on public.products_services
  for select using (public.is_workspace_member(workspace_id));

create policy "products_services_insert_editor" on public.products_services
  for insert with check (public.is_workspace_editor(workspace_id));

create policy "products_services_update_editor" on public.products_services
  for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));

create policy "products_services_delete_editor" on public.products_services
  for delete using (public.is_workspace_editor(workspace_id));

-- =============================================================================
-- content_strategies
-- =============================================================================
create policy "content_strategies_select_member" on public.content_strategies
  for select using (public.is_workspace_member(workspace_id));

create policy "content_strategies_insert_editor" on public.content_strategies
  for insert with check (public.is_workspace_editor(workspace_id));

create policy "content_strategies_update_editor" on public.content_strategies
  for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));

create policy "content_strategies_delete_editor" on public.content_strategies
  for delete using (public.is_workspace_editor(workspace_id));

-- =============================================================================
-- content_pillars
-- =============================================================================
create policy "content_pillars_select_member" on public.content_pillars
  for select using (public.is_workspace_member(workspace_id));

create policy "content_pillars_insert_editor" on public.content_pillars
  for insert with check (
    public.is_workspace_editor(workspace_id)
    and workspace_id = public.strategy_workspace_id(strategy_id)
  );

create policy "content_pillars_update_editor" on public.content_pillars
  for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));

create policy "content_pillars_delete_editor" on public.content_pillars
  for delete using (public.is_workspace_editor(workspace_id));

-- =============================================================================
-- content_calendars
-- =============================================================================
create policy "content_calendars_select_member" on public.content_calendars
  for select using (public.is_workspace_member(workspace_id));

create policy "content_calendars_insert_editor" on public.content_calendars
  for insert with check (public.is_workspace_editor(workspace_id));

create policy "content_calendars_update_editor" on public.content_calendars
  for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));

create policy "content_calendars_delete_editor" on public.content_calendars
  for delete using (public.is_workspace_editor(workspace_id));

-- =============================================================================
-- calendar_posts — authorized via the parent calendar's workspace.
-- =============================================================================
create policy "calendar_posts_select_member" on public.calendar_posts
  for select using (public.is_workspace_member(public.calendar_workspace_id(calendar_id)));

create policy "calendar_posts_insert_editor" on public.calendar_posts
  for insert with check (public.is_workspace_editor(public.calendar_workspace_id(calendar_id)));

create policy "calendar_posts_update_editor" on public.calendar_posts
  for update using (public.is_workspace_editor(public.calendar_workspace_id(calendar_id)))
  with check (public.is_workspace_editor(public.calendar_workspace_id(calendar_id)));

create policy "calendar_posts_delete_editor" on public.calendar_posts
  for delete using (public.is_workspace_editor(public.calendar_workspace_id(calendar_id)));

-- =============================================================================
-- content_ideas
-- =============================================================================
create policy "content_ideas_select_member" on public.content_ideas
  for select using (public.is_workspace_member(workspace_id));

create policy "content_ideas_insert_editor" on public.content_ideas
  for insert with check (public.is_workspace_editor(workspace_id));

create policy "content_ideas_update_editor" on public.content_ideas
  for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));

create policy "content_ideas_delete_editor" on public.content_ideas
  for delete using (public.is_workspace_editor(workspace_id));

-- =============================================================================
-- ai_generations — members can read the workspace's AI history; rows are
-- only ever written by the server using the service-role key (RLS bypassed
-- there by design), so no insert/update/delete policy is granted to normal
-- authenticated sessions.
-- =============================================================================
create policy "ai_generations_select_member" on public.ai_generations
  for select using (public.is_workspace_member(workspace_id));
