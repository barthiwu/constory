-- Two independent users for the cross-user authorization matrix: Alice (User
-- A, owns Workspace A) and Bob (User B, owns Workspace B).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com')
on conflict (id) do nothing;

-- profiles would normally be created by the on_auth_user_created trigger at
-- signup time; insert directly here since we inserted the auth.users rows
-- above without going through that path in one transaction-safe step.
insert into public.profiles (id, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'Alice'),
  ('22222222-2222-2222-2222-222222222222', 'Bob')
on conflict (id) do nothing;
