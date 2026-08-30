import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Workspace } from "@/types/database";
import { getActiveWorkspaceIdCookie, setActiveWorkspaceIdCookie } from "@/lib/workspace";

type DB = SupabaseClient<Database>;

export interface WorkspaceSummary extends Workspace {
  role: string;
}

/** All workspaces the current user is a member of, most recently created first. */
export async function getUserWorkspaces(supabase: DB): Promise<WorkspaceSummary[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces(*)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.workspaces)
    .map((row) => ({ ...(row.workspaces as unknown as Workspace), role: row.role }));
}

export async function getWorkspace(supabase: DB, workspaceId: string): Promise<Workspace | null> {
  const { data, error } = await supabase.from("workspaces").select("*").eq("id", workspaceId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Resolves the workspace the current request should operate on: the cookie
 * value if it's still valid for this user, otherwise their most recently
 * created workspace, otherwise null (caller should route to onboarding).
 */
export async function getCurrentWorkspace(supabase: DB): Promise<WorkspaceSummary | null> {
  const workspaces = await getUserWorkspaces(supabase);
  if (workspaces.length === 0) return null;

  const cookieId = await getActiveWorkspaceIdCookie();
  const match = cookieId ? workspaces.find((w) => w.id === cookieId) : undefined;
  return match ?? workspaces[0];
}

export interface CreateWorkspaceInput {
  name: string;
  industry?: string | null;
  website?: string | null;
}

export async function createWorkspace(supabase: DB, ownerId: string, input: CreateWorkspaceInput): Promise<Workspace> {
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ owner_id: ownerId, name: input.name, industry: input.industry ?? null, website: input.website ?? null })
    .select("*")
    .single();
  if (error) throw error;

  await setActiveWorkspaceIdCookie(data.id);
  return data;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string | null;
  industry?: string | null;
  website?: string | null;
  primary_market?: string | null;
}

export async function updateWorkspace(supabase: DB, workspaceId: string, input: UpdateWorkspaceInput): Promise<Workspace> {
  const { data, error } = await supabase.from("workspaces").update(input).eq("id", workspaceId).select("*").single();
  if (error) throw error;
  return data;
}

export async function switchWorkspace(workspaceId: string) {
  await setActiveWorkspaceIdCookie(workspaceId);
}
