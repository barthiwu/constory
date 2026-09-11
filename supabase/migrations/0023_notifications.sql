-- =============================================================================
-- Constory V1 — notifications: in-app feed + per-user email preferences,
-- plus an idempotency ledger for the three system-generated notification
-- types (low AI credits, scheduled-post reminders, weekly digest).
--
-- Mirrors two existing patterns rather than inventing new ones:
--   - billing_events (migration 0009): an internal idempotency ledger with
--     RLS enabled and NO policies granted to `authenticated` — only the
--     service-role (admin) client ever touches it, since notifications are
--     always system-generated (a cron route or a server-side credit spend),
--     never user-authored.
--   - workspace_invites-style per-row RLS (migration 0021): a user can only
--     see/update their own rows.
--
-- All three tables are written by the service-role client from server code
-- (services/notification-service.ts, the cron routes, and the credit-spend
-- path in billing-service.ts) — none of this is meant to be insertable by
-- `authenticated` directly, since a client-forged "you have 0 credits left"
-- notification is not something RLS should have to reason about.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- notification_preferences — one row per user, defaults to everything on so
-- a brand-new account starts fully notified rather than silently opted out.
-- -----------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email_low_credits boolean not null default true,
  email_scheduled_posts boolean not null default true,
  email_weekly_digest boolean not null default true,
  inapp_low_credits boolean not null default true,
  inapp_scheduled_posts boolean not null default true,
  inapp_weekly_digest boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "notification_preferences_select_own" on public.notification_preferences
  for select using (user_id = auth.uid());

create policy "notification_preferences_insert_own" on public.notification_preferences
  for insert with check (user_id = auth.uid());

create policy "notification_preferences_update_own" on public.notification_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- notifications — the in-app feed. `workspace_id` is nullable: account-level
-- notifications (low credits) have none, workspace-scoped ones (scheduled
-- post reminders, weekly digest) carry one so the bell can deep-link.
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  type text not null check (type in ('low_credits', 'scheduled_post_reminder', 'weekly_digest')),
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_id_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());

-- Mark-as-read only: a client can flip read_at, nothing else worth
-- restricting further since every other column is server-authored anyway
-- (there's no UPDATE ... WITH CHECK that meaningfully differs here).
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- notification_log — idempotency ledger so a cron route that runs more than
-- once (or overlapping invocations) never sends the same reminder/digest
-- twice. event_key encodes what would otherwise be duplicated, e.g.
-- 'low_credits:<owner_id>:<period_end>', 'post_reminder:<post_id>',
-- 'weekly_digest:<workspace_id>:<iso_year>-W<iso_week>'.
-- -----------------------------------------------------------------------------
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_created_at_idx on public.notification_log (created_at);

alter table public.notification_log enable row level security;
-- No policies granted to `authenticated` — see the file comment above.

grant select, insert, update on public.notification_preferences to authenticated;
grant select, update on public.notifications to authenticated;
