-- =============================================================================
-- ai_generations is written by the app on behalf of the signed-in user (not
-- via the service-role key), so it needs explicit insert/update policies
-- scoped to that user acting as an editor of the workspace. This keeps the
-- audit trail working under the same RLS model as everything else, rather
-- than requiring server-role credentials for a routine app write.
-- =============================================================================

create policy "ai_generations_insert_self" on public.ai_generations
  for insert with check (
    user_id = auth.uid()
    and public.is_workspace_editor(workspace_id)
  );

create policy "ai_generations_update_self" on public.ai_generations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
