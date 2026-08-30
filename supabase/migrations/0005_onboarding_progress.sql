-- =============================================================================
-- Onboarding progress persistence
--
-- Adds durable, server-side tracking of onboarding progress on the workspace
-- itself, so the wizard can resume at the correct step after a refresh, a
-- logout/login cycle, or the browser being closed and reopened later —
-- frontend-only state is not sufficient for this.
-- =============================================================================

alter table public.workspaces
  add column if not exists onboarding_step integer not null default 0,
  add column if not exists onboarding_completed boolean not null default false;

alter table public.workspaces
  drop constraint if exists workspaces_onboarding_step_range;

alter table public.workspaces
  add constraint workspaces_onboarding_step_range check (onboarding_step >= 0 and onboarding_step <= 7);

comment on column public.workspaces.onboarding_step is
  'Index of the onboarding step the user should resume at (0 = workspace basics .. 7 = review/complete).';
comment on column public.workspaces.onboarding_completed is
  'True once the user has finished the onboarding wizard for this workspace.';

-- Backfill: workspaces created before this migration have no step tracking, but
-- if they already have a brand profile with real content, they were already
-- onboarded under the old (implicit) rules — mark them complete so existing
-- users are never forced back into the wizard by this change.
update public.workspaces w
set onboarding_completed = true,
    onboarding_step = 7
where w.onboarding_completed = false
  and exists (
    select 1
    from public.brand_profiles bp
    where bp.workspace_id = w.id
      and length(trim(bp.business_description)) > 0
  );
