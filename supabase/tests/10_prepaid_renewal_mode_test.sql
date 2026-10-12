-- Regression tests for migration 0029 (prepaid / bank-transfer plans: subscriptions.renewal_mode).
\set ON_ERROR_STOP on
\pset pager off

\echo '--- 0029: renewal_mode defaults to auto, can be manual on a paid plan, and resets to auto on Free ---'
do $$
declare
  v_mode text;
begin
  select renewal_mode into v_mode from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
  if v_mode is distinct from 'auto' then raise exception 'FAIL: expected default auto, got %', v_mode; end if;

  update public.subscriptions set plan_id = 'pro', renewal_mode = 'manual' where owner_id = '11111111-1111-1111-1111-111111111111';
  select renewal_mode into v_mode from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
  if v_mode is distinct from 'manual' then raise exception 'FAIL: manual not kept on a paid plan, got %', v_mode; end if;

  update public.subscriptions set plan_id = 'free' where owner_id = '11111111-1111-1111-1111-111111111111';
  select renewal_mode into v_mode from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
  if v_mode is distinct from 'auto' then raise exception 'FAIL: free should reset renewal_mode to auto, got %', v_mode; end if;

  begin
    update public.subscriptions set plan_id = 'pro', renewal_mode = 'weekly' where owner_id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: invalid renewal_mode accepted';
  exception when check_violation then null;
  end;
  update public.subscriptions set plan_id = 'free' where owner_id = '11111111-1111-1111-1111-111111111111';
end
$$;

\echo '--- 0029: an authenticated user can read renewal_mode but NOT change it ---'
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare
  v_mode text;
begin
  select renewal_mode into v_mode from public.subscriptions where owner_id = '11111111-1111-1111-1111-111111111111';
  if v_mode is null then raise exception 'FAIL: could not read own renewal_mode'; end if;
  begin
    update public.subscriptions set renewal_mode = 'manual' where owner_id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: authenticated could write renewal_mode';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
\echo 'OK: 10_prepaid_renewal_mode_test'
