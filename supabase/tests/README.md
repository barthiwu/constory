# Database / RLS test suite

These scripts exercise the real migrations in `supabase/migrations/` against a
real PostgreSQL engine, using a minimal simulation of Supabase's `auth` schema
and role model (`00_bootstrap_auth_sim.sql`). They are the reproducible,
committed replacement for ad hoc manual testing — every script here can be
re-run at any time to re-verify the database layer.

**Why a simulation instead of the real Supabase project:** the environment
these fixes were built in has no network path to `*.supabase.co` (an egress
allowlist blocks it), so these tests run against a local PostgreSQL 16 instance
instead. The simulation only stubs `auth.users`, `auth.uid()`, `auth.role()`,
and the `anon`/`authenticated`/`service_role` roles — enough to make RLS
policies evaluate exactly as they would under real PostgREST requests. The
schema, functions, triggers, and RLS policies under test are the unmodified
files from `supabase/migrations/`. Before relying on a production Supabase
project, also run `supabase db push` there and spot-check with real accounts —
this suite proves the policies are correct, not that GoTrue/PostgREST are
configured identically.

## Running

Requires a local PostgreSQL 16+ server and `psql` on PATH.

```bash
./supabase/tests/run.sh
```

This creates a scratch database (`constory_test`, dropped and recreated each
run), applies every migration in order, then runs each numbered test script
and prints its output. Every script uses `\echo` to label each assertion with
the expected result — read the output and confirm every count/expectation
matches what the comment says. A script exits nonzero if the connection or a
DDL statement itself fails; policy checks are verified by eye against the
labeled `\echo` expectations rather than a pass/fail harness, since the point
is to inspect actual row counts and error messages from a real Postgres
engine, not to hide them behind an assertion library.

## What's covered

- `02_cross_user_rls_test.sql` — the full two-user model required by the
  correction task: User A (Alice) owns Workspace A, User B (Bob) owns
  Workspace B. Verifies Bob cannot read or write Alice's workspace, brand
  profile, products/services, content strategy, pillars, calendars, calendar
  posts, ideas, or AI generation records — for every table, by direct
  `SELECT`/`UPDATE`/`DELETE`/`INSERT` attempts, not by trusting the app layer.
- `03_viewer_role_test.sql` — a `viewer` member can read workspace data but
  every write attempt is rejected by RLS (0 rows affected / policy error).
- `04_privilege_escalation_test.sql` — a non-owner member cannot update their
  own `workspace_members` row to grant themselves `owner`/`admin`.
- `05_onboarding_progress_test.sql` — the `onboarding_step`/`onboarding_completed`
  columns added in migration `0005` behave as the app relies on: they default
  correctly for new workspaces, the pre-existing-workspace backfill logic
  marks already-onboarded workspaces complete, and a non-member cannot read or
  advance another workspace's onboarding progress.
