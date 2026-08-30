-- Minimal simulation of Supabase's auth schema + role model, just enough to
-- run our own migrations and genuinely exercise RLS the way PostgREST would
-- (a request authenticated as a given auth.uid(), via the `authenticated`
-- Postgres role). This does not stand in for GoTrue itself — it exists only
-- to let us verify our schema's triggers and RLS policies against a real
-- Postgres engine instead of by inspection alone. See README.md.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mirrors Supabase's actual auth.uid()/auth.role(): reads the JWT claims a
-- PostgREST request sets via `SET request.jwt.claims` for the session.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
