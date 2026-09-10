import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Role, Workspace, InviteRole, WorkspaceInvite } from "@/types/database";
import { getActiveWorkspaceIdCookie, setActiveWorkspaceIdCookie } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/server";

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
  // Uses the caller's RLS-scoped client, not the admin/service-role one --
  // see migration 0019 for why this previously had to bypass RLS via the
  // admin client (Supabase Support root-caused it: PostgREST's
  // insert-then-read-back needed workspaces_select_member to pass too, and
  // that policy didn't yet consider the owner a "member" at the moment of
  // insert). `ownerId` is still never client-supplied -- callers pass
  // `user.id` from a server-verified `supabase.auth.getUser()` (see
  // app/app/onboarding/actions.ts), and the caller has already run
  // canCreateBrand() before reaching this function.
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

/**
 * Permanently deletes a workspace and every row that belongs to it -- content
 * pillars, calendars, calendar posts, ideas, products, memberships, etc. all
 * cascade-delete at the database level (see migration 0001_init_schema.sql).
 * Billing history is the one exception: it uses ON DELETE SET NULL so past
 * invoices/subscriptions survive the workspace being deleted.
 *
 * Authorization relies entirely on the `workspaces_delete_owner` RLS policy
 * (owner_id = auth.uid()) via the caller's regular RLS-scoped client -- unlike
 * createWorkspace's insert, there's no known platform bug blocking this, so no
 * admin-client bypass is needed. Because a failed RLS check on DELETE returns
 * zero affected rows rather than a Postgres error, we explicitly select the
 * deleted row back and treat zero rows as an authorization failure so callers
 * can't mistake a silent no-op for success.
 */
export async function deleteWorkspace(supabase: DB, workspaceId: string): Promise<void> {
  const { data, error } = await supabase.from("workspaces").delete().eq("id", workspaceId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Workspace not found, or you don't have permission to delete it.");
  }
}

// =============================================================================
// Team / multi-member workspace management (migration 0021).
// =============================================================================

export interface WorkspaceMemberSummary {
  id: string;
  userId: string;
  role: Role;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  isSelf: boolean;
  createdAt: string;
}

/**
 * The full member roster for a workspace, with each member's email resolved
 * via the admin client's auth API — `profiles` deliberately has no email
 * column (Supabase auth.users already owns that), and a regular RLS-scoped
 * session has no access to other users' auth.users rows at all, so this is
 * the same pattern already used in app/api/webhooks/paystack/route.ts's
 * markPastDueByEmail. The membership rows themselves still go through the
 * caller's own RLS-scoped client first — workspace_members_select_member
 * already lets any member read the whole roster, so this never uses the
 * admin client for anything except the email lookup.
 */
export async function getWorkspaceMembers(supabase: DB, workspaceId: string, currentUserId: string): Promise<WorkspaceMemberSummary[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, created_at, profiles(full_name, avatar_url)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const admin = createAdminClient();
  const emails = await Promise.all(
    rows.map(async (row) => {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(row.user_id);
        return userData?.user?.email ?? null;
      } catch {
        return null;
      }
    }),
  );

  return rows.map((row, i) => {
    const profile = row.profiles as unknown as { full_name: string | null; avatar_url: string | null } | null;
    return {
      id: row.id,
      userId: row.user_id,
      role: row.role as Role,
      fullName: profile?.full_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      email: emails[i],
      isSelf: row.user_id === currentUserId,
      createdAt: row.created_at,
    };
  });
}

/** Changes a member's role. Never 'owner' — see workspace_members_update_admin (migration 0021), which rejects that at the database level too. */
export async function updateMemberRole(supabase: DB, workspaceId: string, memberUserId: string, role: InviteRole): Promise<void> {
  const { data, error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberUserId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Couldn't update that member's role — they may not be a member, or you may not have permission.");
  }
}

/** Removes a member from a workspace. Also how "leave workspace" works when `memberUserId` is the caller's own id — see workspace_members_delete_self (migration 0021). */
export async function removeMember(supabase: DB, workspaceId: string, memberUserId: string): Promise<void> {
  const { data, error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberUserId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Couldn't remove that member — they may not be a member, or you may not have permission.");
  }
}

export interface WorkspaceInviteSummary {
  id: string;
  email: string;
  role: InviteRole;
  token: string;
  createdAt: string;
  expiresAt: string;
  invitedByName: string | null;
}

/** Pending invites for a workspace — the "waiting to be accepted" list shown alongside the member roster. */
export async function getPendingInvites(supabase: DB, workspaceId: string): Promise<WorkspaceInviteSummary[]> {
  const { data, error } = await supabase
    .from("workspace_invites")
    .select("id, email, role, token, created_at, expires_at, profiles!workspace_invites_invited_by_fkey(full_name)")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as InviteRole,
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    invitedByName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
  }));
}

/**
 * Creates a pending invite. `invitedBy` must already be server-verified (the
 * caller's own authenticated session) — the RLS insert policy also checks
 * `invited_by = auth.uid()` independently, so a mismatched value here would
 * simply fail at the database, not silently misattribute the invite.
 */
export async function createInvite(supabase: DB, workspaceId: string, invitedBy: string, email: string, role: InviteRole): Promise<WorkspaceInvite> {
  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({ workspace_id: workspaceId, email: email.trim().toLowerCase(), role, invited_by: invitedBy })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("There's already a pending invite for that email.");
    }
    throw error;
  }
  return data as WorkspaceInvite;
}

/** Revokes a pending invite — it stops being acceptable, but the row is kept (not deleted) for an audit trail. */
export async function revokeInvite(supabase: DB, inviteId: string): Promise<void> {
  const { data, error } = await supabase
    .from("workspace_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("status", "pending")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Couldn't revoke that invite — it may already be accepted or revoked.");
  }
}

export interface InvitePreview {
  workspaceId: string;
  workspaceName: string;
  role: InviteRole;
  invitedEmail: string;
  inviterName: string | null;
  status: "pending" | "accepted" | "revoked";
  expired: boolean;
}

/** Public preview for the accept-invite page — works whether or not the visitor is logged in (see get_invite_preview's grant to `anon`). */
export async function getInvitePreview(supabase: DB, token: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc("get_invite_preview", { p_token: token });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    role: row.role,
    invitedEmail: row.invited_email,
    inviterName: row.inviter_name,
    status: row.status,
    expired: row.expired,
  };
}

export interface AcceptInviteResult {
  ok: boolean;
  reason: string;
  workspaceId: string | null;
}

/** Accepts a pending invite for the CALLER's own (already-authenticated) session — see accept_workspace_invite's comment (migration 0021) for why this has to be a SECURITY DEFINER RPC rather than a direct insert. */
export async function acceptInvite(supabase: DB, token: string): Promise<AcceptInviteResult> {
  const { data, error } = await supabase.rpc("accept_workspace_invite", { p_token: token });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return { ok: false, reason: "unknown_error", workspaceId: null };
  return { ok: row.ok, reason: row.reason, workspaceId: row.workspace_id };
}
