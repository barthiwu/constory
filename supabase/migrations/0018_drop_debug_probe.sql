-- Cleanup: drop the temporary debug_insert_probe_v2 function added while
-- diagnosing the workspaces RLS/PostgREST anomaly (see comment in
-- services/workspace-service.ts's createWorkspace() for full context).
drop function if exists public.debug_insert_probe_v2(uuid, text);
