-- =============================================================================
-- Constory V1 -- security hardening (full-codebase security audit).
--
-- 1. CRITICAL: the three SECURITY DEFINER billing functions added in 0020
--    (set_subscription_pending_change, resolve_scheduled_plan_change,
--    mark_subscription_past_due) were only ever `GRANT EXECUTE ... TO
--    service_role`. A GRANT to one role does NOT remove the default EXECUTE
--    that PUBLIC (and therefore anon + authenticated) already holds on every
--    new function, and PostgREST publishes every public-schema function at
--    /rest/v1/rpc/<name>. Net effect: any visitor holding the (public)
--    publishable key could call resolve_scheduled_plan_change(<own user id>,
--    'pro', 'monthly', now(), now() + interval '10 years', 100000) and give
--    themselves a free Pro plan with unlimited credits. They also trust
--    p_owner_id blindly, so mark_subscription_past_due(<victim id>) could
--    knock another account into past_due. Migration 0010 closed exactly this
--    hole for apply_plan_change; 0020 reopened it for its three new siblings.
--
-- 2. Every other SECURITY DEFINER function in `public` no longer executes for
--    anon (only get_invite_preview, which logged-out invitees need, keeps it).
--    Each of them already refuses a caller with no auth.uid(), so this is
--    defense in depth that also removes them from the anonymous API surface.
--
-- 3. Pins `search_path` on any SECURITY DEFINER function that doesn't have one
--    yet (privilege-escalation-by-shadowed-object hardening).
--
-- 4. accept_workspace_invite now requires the caller's email to be CONFIRMED.
--    Invites match on email address; without this, someone who signed up with
--    an invitee's address but never proved they own it could accept the invite.
--
-- 5. Adds a tiny atomic rate limiter (rate_limits + check_rate_limit) used by
--    /api/support/chat and the /api/ai/* routes. Service-role only.
-- =============================================================================

-- ---- 1. Billing RPCs: service_role only -------------------------------------
revoke execute on function public.set_subscription_pending_change(uuid, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.resolve_scheduled_plan_change(uuid, text, text, timestamptz, timestamptz, integer, text, text) from public, anon, authenticated;
revoke execute on function public.mark_subscription_past_due(uuid) from public, anon, authenticated;
revoke execute on function public.apply_plan_change(uuid, text, text, text, timestamptz, timestamptz, boolean, integer) from public, anon, authenticated;

grant execute on function public.set_subscription_pending_change(uuid, boolean, text, text) to service_role;
grant execute on function public.resolve_scheduled_plan_change(uuid, text, text, timestamptz, timestamptz, integer, text, text) to service_role;
grant execute on function public.mark_subscription_past_due(uuid) to service_role;
grant execute on function public.apply_plan_change(uuid, text, text, text, timestamptz, timestamptz, boolean, integer) to service_role;

-- ---- 2 + 3. Baseline for every other SECURITY DEFINER function ---------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig,
           p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);

    if r.proconfig is null or not exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%') then
      execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
    end if;
  end loop;
end
$$;

-- Logged-out invitees open /invite/<token> before they have an account.
grant execute on function public.get_invite_preview(uuid) to anon, authenticated;

-- The service-role-only billing RPCs must not have been re-opened by the
-- baseline loop above.
revoke execute on function public.set_subscription_pending_change(uuid, boolean, text, text) from authenticated;
revoke execute on function public.resolve_scheduled_plan_change(uuid, text, text, timestamptz, timestamptz, integer, text, text) from authenticated;
revoke execute on function public.mark_subscription_past_due(uuid) from authenticated;
revoke execute on function public.apply_plan_change(uuid, text, text, text, timestamptz, timestamptz, boolean, integer) from authenticated;

-- ---- 4. Invites: require a confirmed email ------------------------------------
create or replace function public.accept_workspace_invite(p_token uuid)
returns table (ok boolean, reason text, workspace_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_invite record;
  v_caller_email text;
  v_caller_confirmed timestamptz;
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

  select email, email_confirmed_at into v_caller_email, v_caller_confirmed
    from auth.users where id = auth.uid();
  if v_caller_email is null or lower(v_caller_email) <> lower(v_invite.email) then
    return query select false, 'email_mismatch', v_invite.workspace_id;
    return;
  end if;

  -- The invite is addressed to an email; only someone who has proven they
  -- control that mailbox may claim it.
  if v_caller_confirmed is null then
    return query select false, 'email_unconfirmed', v_invite.workspace_id;
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

revoke execute on function public.accept_workspace_invite(uuid) from public, anon;
grant execute on function public.accept_workspace_invite(uuid) to authenticated, service_role;

-- ---- 5. Rate limiter ---------------------------------------------------------
create table if not exists public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
-- No policies: only the service role (which bypasses RLS) ever touches this.
revoke all on public.rate_limits from public, anon, authenticated;

-- Fixed-window counter. Returns true while the caller is still within
-- `p_max` hits for the current `p_window_seconds` window, false once over.
create or replace function public.check_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_window_seconds < 1 or p_max < 1 then
    raise exception 'check_rate_limit: p_max and p_window_seconds must be positive';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  -- Opportunistic cleanup so the table can't grow without bound.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
