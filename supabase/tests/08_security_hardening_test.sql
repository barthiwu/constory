-- Regression tests for migration 0027 (security hardening). Unlike the older
-- scripts these use hard assertions: any failure raises and, because run.sh
-- runs psql with ON_ERROR_STOP=1, fails the whole run (and CI).
\set ON_ERROR_STOP on
\pset pager off

\echo '--- 0027: authenticated users can NOT call the billing RPCs (privilege escalation: free Pro plan) ---'
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  begin
    perform public.resolve_scheduled_plan_change('22222222-2222-2222-2222-222222222222', 'pro', 'monthly', now(), now() + interval '10 years', 100000);
    raise exception 'FAIL: authenticated could execute resolve_scheduled_plan_change';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_subscription_pending_change('11111111-1111-1111-1111-111111111111', true, 'free', 'monthly');
    raise exception 'FAIL: authenticated could execute set_subscription_pending_change';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_subscription_past_due('11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: authenticated could execute mark_subscription_past_due';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.apply_plan_change('22222222-2222-2222-2222-222222222222', 'pro', 'monthly', 'manual', now(), now() + interval '1 year', false, 100000);
    raise exception 'FAIL: authenticated could execute apply_plan_change';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.check_rate_limit('x', 1, 60);
    raise exception 'FAIL: authenticated could execute check_rate_limit';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

\echo '--- 0027: anon can NOT call them either ---'
set role anon;
set request.jwt.claims = '';
do $$
begin
  begin
    perform public.resolve_scheduled_plan_change('22222222-2222-2222-2222-222222222222', 'pro', 'monthly', now(), now() + interval '10 years', 100000);
    raise exception 'FAIL: anon could execute resolve_scheduled_plan_change';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_subscription_past_due('11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: anon could execute mark_subscription_past_due';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.accept_workspace_invite('00000000-0000-0000-0000-000000000000');
    raise exception 'FAIL: anon could execute accept_workspace_invite';
  exception when insufficient_privilege then null;
  end;
  -- get_invite_preview must stay callable by logged-out invitees.
  perform public.get_invite_preview('00000000-0000-0000-0000-000000000000');
end
$$;
reset role;

\echo '--- 0027: Bob still has Free; the escalation attempt changed nothing ---'
do $$
declare v_plan text;
begin
  select plan_id into v_plan from public.subscriptions where owner_id = '22222222-2222-2222-2222-222222222222';
  if v_plan is distinct from 'free' then raise exception 'FAIL: Bob''s plan is %, expected free', v_plan; end if;
end
$$;

\echo '--- 0027: service_role (the app''s admin client) still can use them ---'
set role service_role;
do $$
begin
  perform public.mark_subscription_past_due('22222222-2222-2222-2222-222222222222');
  perform public.set_subscription_pending_change('22222222-2222-2222-2222-222222222222', false, null, null);
  if not public.check_rate_limit('test-bucket', 2, 3600) then raise exception 'FAIL: 1st hit should be allowed'; end if;
  if not public.check_rate_limit('test-bucket', 2, 3600) then raise exception 'FAIL: 2nd hit should be allowed'; end if;
  if public.check_rate_limit('test-bucket', 2, 3600) then raise exception 'FAIL: 3rd hit should be blocked'; end if;
  if not public.check_rate_limit('other-bucket', 2, 3600) then raise exception 'FAIL: buckets must be independent'; end if;
end
$$;
reset role;
update public.subscriptions set status = 'active' where owner_id = '22222222-2222-2222-2222-222222222222';

\echo '--- 0027: rate_limits table is not directly readable/writable by clients ---'
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  begin
    perform 1 from public.rate_limits limit 1;
    raise exception 'FAIL: authenticated could read rate_limits';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

\echo '--- 0027: every SECURITY DEFINER function in public has a pinned search_path ---'
do $$
declare v_bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if v_bad is not null then raise exception 'FAIL: no pinned search_path on: %', v_bad; end if;
end
$$;

\echo '--- 0027: an unconfirmed email can not accept an invite ---'
do $$
declare
  v_ws uuid; v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_token uuid; v_user uuid := gen_random_uuid(); v_ok boolean; v_reason text;
begin
  select id into v_ws from public.workspaces where owner_id = v_owner limit 1;
  insert into auth.users (id, email, email_confirmed_at) values (v_user, 'unconfirmed@example.test', null);
  insert into public.workspace_invites (workspace_id, email, role, invited_by)
  values (v_ws, 'unconfirmed@example.test', 'viewer', v_owner) returning token into v_token;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select a.ok, a.reason into v_ok, v_reason from public.accept_workspace_invite(v_token) a;
  reset role;

  if v_ok or v_reason <> 'email_unconfirmed' then
    raise exception 'FAIL: unconfirmed email accepted invite (ok=%, reason=%)', v_ok, v_reason;
  end if;

  update auth.users set email_confirmed_at = now() where id = v_user;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select a.ok, a.reason into v_ok, v_reason from public.accept_workspace_invite(v_token) a;
  reset role;
  if not v_ok then raise exception 'FAIL: confirmed email could not accept invite (reason=%)', v_reason; end if;
end
$$;

\echo '== 08_security_hardening_test: ALL ASSERTIONS PASSED =='
