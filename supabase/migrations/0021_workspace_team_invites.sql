-- =============================================================================
-- Constory V1 — team / multi-member workspace invites.
--
-- workspace_members already exists (migration 0001) with four roles (owner,
-- admin, editor, viewer) and RLS letting any member read the roster
-- (workspace_members_select_member, migration 0003) but only the workspace
-- OWNER write to it at all (insert/update/delete). Product decision:
-- admins should also be able to manage the team (invite, remove, change
-- roles) — just never touch the owner's own row or promote anyone to
-- owner; ownership transfer isn't a V1 feature.
--
-- There is also no way today to add someone who doesn't already have a
-- workspace_members row, and no invite-by-email exists at all — this
-- migration adds that:
--   1. is_workspace_admin() (owner OR admin) alongside the existing
--      is_workspace_member()/is_workspace_editor() helpers.
--   2. Replaces the owner-only workspace_members write policies with
--      admin-or-owner ones (the auto-owner-row-on-workspace-creation
--      trigger, handle_new_workspace() in migration 0002, is SECURITY
--      DEFINER and so bypasses these RLS policies entirely — nothing here
--      touches that path).
--   3. A "leave workspace" self-delete policy (any non-owner member can
--      remove their own membership row, independent of who's admin).
--   4. workspace_invites — email, role, a random token, status, expiry.
--   5. Two RPCs: get_invite_preview (public — lets an invite link show
--      "you've been invited to X" before the visitor even logs in, since
--      they may not have an account yet) and accept_workspace_invite
--      (SECURITY DEFINER, authenticated-only — the only way a
--      workspace_members row ever gets created for someone other than a
--      workspace's creator; see its comment for why a plain RLS INSERT
--      policy can't do this instead — it needs to compare the invite's
--      email against the caller's own auth.users email, and `authenticated`
--      has no SELECT access to auth.users).
-- =============================================================================

create or replace function public.is_workspace_admin(target_workspace_id uuid)
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
      and wm.role in ('owner', 'admin')
  );
$$;

-- -----------------------------------------------------------------------------
-- workspace_members: owner-only write policies (migration 0003) -> admin-or-
-- owner. USING/WITH CHECK both exclude role = 'owner' so neither the owner's
-- own row can be touched nor a new owner created this way.
-- -----------------------------------------------------------------------------
drop policy if exists "workspace_members_insert_owner" on public.workspace_members;
drop policy if exists "workspace_members_update_owner" on public.workspace_members;
drop policy if exists "workspace_members_delete_owner" on public.workspace_members;

create policy "workspace_members_insert_admin" on public.workspace_members
  for insert with check (
    public.is_workspace_admin(workspace_id) and role <> 'owner'
  );

create policy "workspace_members_update_admin" on public.workspace_members
  for update using (
    public.is_workspace_admin(workspace_id) and role <> 'owner'
  ) with check (
    public.is_workspace_admin(workspace_id) and role <> 'owner'
  );

create policy "workspace_members_delete_admin" on public.workspace_members
  for delete using (
    public.is_workspace_admin(workspace_id) and role <> 'owner'
  );

-- Any non-owner member can remove their own row ("leave workspace"),
-- regardless of whether they're an admin themselves — combined with the
-- policy above by OR, per Postgres's multiple-permissive-policies rule.
create policy "workspace_members_delete_self" on public.workspace_members
  for delete using (
    user_id = auth.uid() and role <> 'owner'
  );

-- -----------------------------------------------------------------------------
-- workspace_invites
-- -----------------------------------------------------------------------------
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);

create index if not exists workspace_invites_workspace_id_idx on public.workspace_invites (workspace_id);

-- Only one PENDING invite per (workspace, email) at a time — re-inviting
-- after a revoke or an acceptance is fine (a new row), just not two pending
-- invites to the same address simultaneously.
create unique index if not exists workspace_invites_pending_unique
  on public.workspace_invites (workspace_id, email) where status = 'pending';

alter table public.workspace_invites enable row level security;

create policy "workspace_invites_select_admin" on public.workspace_invites
  for select using (public.is_workspace_admin(workspace_id));

create policy "workspace_invites_insert_admin" on public.workspace_invites
  for insert with check (
    public.is_workspace_admin(workspace_id)
    and role <> 'owner'
    and invited_by = auth.uid()
  );

-- Only used to revoke (status -> 'revoked') from the app today, but not
-- narrowed to that specific transition — same broad trust level as the
-- rest of an admin/owner's self-service workspace management elsewhere in
-- this schema (e.g. workspace_members_update_admin above).
create policy "workspace_invites_update_admin" on public.workspace_invites
  for update using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- -----------------------------------------------------------------------------
-- get_invite_preview — lets the public accept-invite page show "you've been
-- invited to <workspace> as <role>" before the visitor is even logged in
-- (they may not have an account yet). Only exposes what the inviter already
-- put in the invite itself, plus the workspace's own name and the inviter's
-- display name — nothing about the workspace's other members or content.
-- Granted to anon too, deliberately — the preview must work logged out.
-- -----------------------------------------------------------------------------
create or replace function public.get_invite_preview(p_token uuid)
returns table (
  workspace_id uuid,
  workspace_name text,
  role text,
  invited_email text,
  inviter_name text,
  status text,
  expired boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    wi.workspace_id,
    w.name,
    wi.role,
    wi.email,
    p.full_name,
    wi.status,
    (wi.status = 'pending' and wi.expires_at < now())
  from public.workspace_invites wi
  join public.workspaces w on w.id = wi.workspace_id
  left join public.profiles p on p.id = wi.invited_by
  where wi.token = p_token;
$$;

grant execute on function public.get_invite_preview(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- accept_workspace_invite — the ONLY way a workspace_members row is ever
-- created for someone other than a workspace's own creator (that path is
-- the SECURITY DEFINER trigger in migration 0002, which bypasses RLS
-- entirely and isn't reachable by a client at all). Can't be done as a
-- plain RLS INSERT policy instead: the check that actually matters — "does
-- this invite's email match the caller's own account email" — needs
-- auth.users, which `authenticated` has no SELECT access to by default in
-- Supabase (the same reason app/api/webhooks/paystack/route.ts's
-- markPastDueByEmail needs the ADMIN client's auth.admin API from server
-- code instead of a direct query). A SECURITY DEFINER function is what
-- actually gets auth.users access here, with every trust-relevant check
-- done explicitly inside it. Granted to `authenticated` only (never anon):
-- must be logged in for auth.uid()/auth.users to mean anything.
-- -----------------------------------------------------------------------------
create or replace function public.accept_workspace_invite(p_token uuid)
returns table (ok boolean, reason text, workspace_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_caller_email text;
begin
  select * into v_invite from public.workspace_invites where token = p_token;

  if v_invite is null then
    return query select false, 'not_found', null::uuid;
    return;
  end if;

  if v_invite.status <> 'pending' then
    return query select false, v_invite.status, v_invite.workspace_id;
    return;
  end if;

  if v_invite.expires_at < now() then
    return query select false, 'expired', v_invite.workspace_id;
    return;
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();
  if v_caller_email is null or lower(v_caller_email) <> lower(v_invite.email) then
    return query select false, 'email_mismatch', v_invite.workspace_id;
    return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, auth.uid(), v_invite.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
    set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    where token = p_token;

  return query select true, 'accepted', v_invite.workspace_id;
end;
$$;

grant execute on function public.accept_workspace_invite(uuid) to authenticated;
