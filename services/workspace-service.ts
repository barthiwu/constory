import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Role, Workspace } from "@/types/database";
import { getActiveWorkspaceIdCookie, setActiveWorkspaceIdCookie } from "@/lib/workspace";

type DB = SupabaseClient<Database>;

/**
 * Confirms the given user actually belongs to the given workspace, and returns
 * their role if so (null otherwise). This is an explicit, app-level authorization
 * check — used as defense in depth alongside RLS, not a replacement for it.
 * Callers that mutate request-scoped state outside the database (e.g. the active
 * workspace cookie) MUST call this before doing so, since RLS only protects
 * database rows, not that kind of state.
 */
export async function getWorkspaceMembership(supabase: DB, userId: string, workspaceId: string): Promise<Role | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role as Role | undefined) ?? null;
}

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

/** Persists which onboarding step the user should resume at for this workspace. */
export async function setOnboardingStep(supabase: DB, workspaceId: string, step: number): Promise<void> {
  const clamped = Math.max(0, Math.min(7, step));
  const { error } = await supabase.from("workspaces").update({ onboarding_step: clamped }).eq("id", workspaceId);
  if (error) throw error;
}

/** Marks onboarding as fully complete for this workspace. */
export async function completeOnboardingWorkspace(supabase: DB, workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from("workspaces")
    .update({ onboarding_completed: true, onboarding_step: 7 })
    .eq("id", workspaceId);
  if (error) throw error;
}

/**
 * Switches the active workspace, but only after confirming the requesting user is
 * authenticated and is an actual member of the target workspace. This check is
 * performed explicitly here — before the cookie is ever written — rather than
 * relying on downstream RLS-protected queries to catch an unauthorized switch,
 * since the active-workspace cookie itself is not something RLS can protect.
 */
export async function switchWorkspace(
  supabase: DB,
  userId: string,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getWorkspaceMembership(supabase, userId, workspaceId);
  if (!role) {
    return { ok: false, error: "You don't have access to that workspace." };
  }
  await setActiveWorkspaceIdCookie(workspaceId);
  return { ok: true };
}
