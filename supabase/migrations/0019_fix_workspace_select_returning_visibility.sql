-- =============================================================================
-- Constory V1 — Fix: workspace creation via PostgREST/RLS-scoped client
-- rejected with 42501, despite a correct, matching auth.uid() (follow-up to
-- migration 0016, which fixed a related-but-distinct STABLE-function-caching
-- issue on the same policy and did not fully resolve this).
--
-- ROOT CAUSE (confirmed by Supabase Support via Postgres logs, Sept 2026):
-- PostgREST doesn't issue a plain INSERT for `.insert(...).select()` — it
-- issues `INSERT ... RETURNING *` wrapped in a CTE, then a further SELECT
-- against that CTE's output. Since Postgres 10+, RETURNING (and this
-- wrapping SELECT) is subject to the table's SELECT RLS policy, not just
-- the INSERT policy's WITH CHECK. So a single `.insert()` call needs BOTH:
--   1. the INSERT to satisfy `workspaces_insert_owner` (WITH CHECK), and
--   2. the newly inserted row to satisfy `workspaces_select_member` (USING)
--      so it can be read back and returned.
--
-- `workspaces_select_member` only allowed rows where
-- `is_workspace_member(id)` is true, i.e. a matching public.workspace_members
-- row must already exist. The `on_workspace_created` trigger (migration
-- 0002) does create that membership row, but not early/visibly enough
-- within the same statement for this read-back to see it -- so the insert
-- itself succeeds, but PostgREST's read-back of the just-inserted row fails
-- RLS, and the whole request comes back as 42501.
--
-- This is why the identical insert succeeded every time in the SQL Editor
-- (a plain INSERT with no RETURNING-then-SELECT wrapping) and why
-- services/workspace-service.ts's createWorkspace() has been using the
-- service-role admin client as a workaround (ownerId there is always
-- server-verified, never client-supplied, so that bypass was safe, but it's
-- no longer necessary once this policy is fixed).
--
-- FIX: let the owner read their own workspace immediately on creation,
-- regardless of whether the membership-table row is visible yet, in
-- addition to the existing membership-based rule for every other member.
-- =============================================================================

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member" on public.workspaces
  for select using (owner_id = (select auth.uid()) or public.is_workspace_member(id));
