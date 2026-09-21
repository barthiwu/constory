-- =============================================================================
-- Constory V1 — support chat: an AI-first support widget (floating button,
-- everywhere in the app) that talks to a visitor/user directly and hands off
-- to a human on WhatsApp when it can't help.
--
-- Same posture as notification_log (migration 0023): RLS enabled, NO
-- policies granted to `anon`/`authenticated`. The widget can be used by a
-- signed-out marketing-site visitor as much as a logged-in user, so there is
-- no single "owns this row" identity to write a policy against -- every read
-- and write goes through app/api/support/chat/route.ts using the
-- service-role (admin) client, which validates and scopes access in code
-- instead. Never query these tables with the session-scoped client.
-- =============================================================================

create table if not exists public.support_chats (
  id uuid primary key default gen_random_uuid(),
  -- Both nullable: a chat can start before signup (marketing site visitor)
  -- or from inside the app (signed-in user). Never trust these as an access
  -- boundary -- see the file header.
  user_id uuid references public.profiles (id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  -- Where the widget was opened from (e.g. "/pricing", "/app/dashboard"),
  -- purely for support context -- never parsed or branched on.
  page_path text,
  status text not null default 'open' check (status in ('open', 'escalated', 'closed')),
  -- Set the first time the "new chat started" notification email is sent,
  -- so a retried/duplicate request never sends it twice.
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_chats_created_at_idx on public.support_chats (created_at desc);
create index if not exists support_chats_user_id_idx on public.support_chats (user_id) where user_id is not null;

alter table public.support_chats enable row level security;
-- No policies granted -- see file header.

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.support_chats (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_chat_id_created_at_idx on public.support_messages (chat_id, created_at);

alter table public.support_messages enable row level security;
-- No policies granted -- see file header.
