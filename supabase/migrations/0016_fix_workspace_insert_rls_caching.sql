-- =============================================================================
-- Constory V1 — Fix: workspace creation failing RLS despite a correct,
-- matching auth.uid().
--
-- ROOT CAUSE: "workspaces_insert_owner" (migration 0003) wrote its WITH CHECK
-- as a bare `owner_id = auth.uid()`. auth.uid() is STABLE, and under
-- PostgREST's pooled/reused connections the planner can cache/inline a bare
-- STABLE function call into a plan that outlives the request it was planned
-- for, so a later request on a reused connection can evaluate against a
-- stale cached value instead of the current request's JWT. Manually
-- replicating the exact insert in a fresh SQL session (no pooling, no
-- reused plan) always succeeded — only requests through the app's pooled
-- PostgREST connections failed, which is the signature of this issue.
--
-- Supabase's own RLS guidance calls this out explicitly: wrap auth.uid() (and
-- any other STABLE per-request function) as `(select auth.uid())` inside
-- policy expressions. The `select` forces the planner to treat it as an
-- initPlan evaluated fresh for the request rather than folding it in as a
-- reusable constant. See:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Also removes the three debug-only objects added while diagnosing this
-- (0013-0015): `debug_create_workspace` in particular is exec-granted to
-- `authenticated` and performs a raw workspace insert with NO plan/brand
-- entitlement check (canCreateBrand), i.e. it's a live unlimited-workspace
-- bypass of billing limits if left in place. `debug_auth_context` and
-- `debug_workspace_insert_policy` are lower-risk (read-only) but are
-- diagnostic-only and no longer needed now that the root cause is fixed.
-- =============================================================================

drop policy if exists "workspaces_insert_owner" on public.workspaces;
create policy "workspaces_insert_owner" on public.workspaces
  for insert with check (owner_id = (select auth.uid()));

drop function if exists public.debug_create_workspace(text, text, text);
drop function if exists public.debug_workspace_insert_policy(uuid);
drop function if exists public.debug_auth_context();
