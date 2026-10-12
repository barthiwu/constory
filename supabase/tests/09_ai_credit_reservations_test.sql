-- Regression tests for migration 0028 (reserve-then-settle credits + viewers can't spend). Hard assertions.
\set ON_ERROR_STOP on
\pset pager off

\echo '--- 0028 setup: Dave (owner, Free = 10 credits), Eve (viewer), Frank (editor) ---'
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'dave@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'eve@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'frank@example.com') on conflict (id) do nothing;
insert into public.profiles (id, full_name) values
  ('44444444-4444-4444-4444-444444444444', 'Dave'),
  ('55555555-5555-5555-5555-555555555555', 'Eve'),
  ('66666666-6666-6666-6666-666666666666', 'Frank') on conflict (id) do nothing;

set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
insert into public.workspaces (id, owner_id, name, industry)
values ('d0d0d0d0-9999-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Dave Co', 'Retail');
reset role;
insert into public.workspace_members (workspace_id, user_id, role) values
  ('d0d0d0d0-9999-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'viewer'),
  ('d0d0d0d0-9999-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', 'editor');

create temp table _res (label text, rid uuid);
grant all on _res to authenticated, service_role;

\echo '--- owner reserves 4 then 4: both succeed and are held immediately ---'
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
do $$
declare r record;
begin
  select * into r from public.reserve_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', 'generate_ideas', 4);
  if not r.ok or r.remaining <> 6 then raise exception 'FAIL: first reserve (ok=%, remaining=%)', r.ok, r.remaining; end if;
  insert into _res values ('first', r.reservation_id);
  select * into r from public.reserve_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', 'generate_strategy', 4);
  if not r.ok or r.remaining <> 2 then raise exception 'FAIL: second reserve (ok=%, remaining=%)', r.ok, r.remaining; end if;
  insert into _res values ('second', r.reservation_id);
end $$;

\echo '--- a THIRD reserve of 4 is refused although nothing has been settled yet (this is the race fix) ---'
do $$
declare r record;
begin
  select * into r from public.reserve_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', 'generate_ideas', 4);
  if r.ok or r.reason <> 'insufficient_credits' then raise exception 'FAIL: third reserve should be insufficient (ok=%, reason=%)', r.ok, r.reason; end if;
end $$;
reset role;

\echo '--- clients can NOT settle or refund (would let them refund their own in-flight generation) ---'
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
do $$
declare v uuid;
begin
  select rid into v from _res where label = 'first';
  begin perform public.refund_ai_credits(v); raise exception 'FAIL: authenticated could refund';
  exception when insufficient_privilege then null; end;
  begin perform public.settle_ai_credits(v); raise exception 'FAIL: authenticated could settle';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$
begin
  begin perform public.reserve_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', 'generate_ideas', 1); raise exception 'FAIL: anon could reserve';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

\echo '--- server (service_role): settle one, refund the other; both idempotent ---'
set role service_role;
do $$
declare a uuid; b uuid; used int;
begin
  select rid into a from _res where label = 'first';
  select rid into b from _res where label = 'second';
  if not public.settle_ai_credits(a) then raise exception 'FAIL: settle should succeed'; end if;
  if public.settle_ai_credits(a) then raise exception 'FAIL: second settle should be a no-op'; end if;
  if public.refund_ai_credits(a) then raise exception 'FAIL: a settled reservation must not be refundable'; end if;
  if not public.refund_ai_credits(b) then raise exception 'FAIL: refund should succeed'; end if;
  if public.refund_ai_credits(b) then raise exception 'FAIL: double refund must be a no-op'; end if;
  select credits_used into used from public.credit_balances where owner_id = '44444444-4444-4444-4444-444444444444';
  if used <> 4 then raise exception 'FAIL: expected 4 credits used after 1 settled + 1 refunded, got %', used; end if;
end $$;
reset role;

\echo '--- a read-only member (viewer) can NOT spend credits, via either RPC; peeking the balance still works ---'
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
do $$
declare r record; c record; used int;
begin
  select * into r from public.reserve_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', 'generate_ideas', 1);
  if r.ok or r.reason <> 'viewer_cannot_use_ai' then raise exception 'FAIL: viewer reserve (ok=%, reason=%)', r.ok, r.reason; end if;
  select * into c from public.consume_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', 'generate_ideas', 1);
  if c.ok or c.reason <> 'viewer_cannot_use_ai' then raise exception 'FAIL: viewer consume (ok=%, reason=%)', c.ok, c.reason; end if;
  select * into c from public.consume_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', null, 0);
  if not c.ok or c.remaining <> 6 then raise exception 'FAIL: viewer peek (ok=%, remaining=%)', c.ok, c.remaining; end if;
end $$;
reset role;

\echo '--- an editor can spend; a stranger can not ---'
set role authenticated;
set request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
do $$
declare r record;
begin
  select * into r from public.reserve_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', 'generate_post', 1);
  if not r.ok then raise exception 'FAIL: editor reserve (reason=%)', r.reason; end if;
  insert into _res values ('editor', r.reservation_id);
end $$;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare r record;
begin
  select * into r from public.reserve_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', 'generate_ideas', 1);
  if r.ok or r.reason <> 'not_a_member' then raise exception 'FAIL: stranger reserve (ok=%, reason=%)', r.ok, r.reason; end if;
end $$;
reset role;

\echo '--- self-heal: a reservation the server never settled/refunded is returned after 10 minutes ---'
-- (the credit period must also pre-date the reservation, otherwise it is correctly treated as a prior-period hold)
update public.credit_balances set period_start = now() - interval '1 day' where owner_id = '44444444-4444-4444-4444-444444444444';
update public.ai_usage_ledger set created_at = now() - interval '11 minutes'
 where id = (select rid from _res where label = 'editor');
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
do $$
declare r record; st text;
begin
  select * into r from public.reserve_ai_credits('d0d0d0d0-9999-0000-0000-000000000001', 'generate_ideas', 1);
  -- used was 4 (settled) + 1 (stale editor reservation). Stale one is returned first -> 4, then +1 -> 5 used -> 5 remaining.
  if not r.ok or r.remaining <> 5 then raise exception 'FAIL: self-heal (ok=%, remaining=%)', r.ok, r.remaining; end if;
end $$;
reset role;
do $$
declare st text;
begin
  select request_status into st from public.ai_usage_ledger where id = (select rid from _res where label = 'editor');
  if st <> 'refunded' then raise exception 'FAIL: stale reservation status is %', st; end if;
end $$;

\echo '== 09_ai_credit_reservations_test: ALL ASSERTIONS PASSED =='
