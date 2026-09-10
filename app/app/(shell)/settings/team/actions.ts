"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  getWorkspaceMembership,
  createInvite,
  revokeInvite,
  updateMemberRole,
  removeMember,
  getUserWorkspaces,
} from "@/services/workspace-service";
import { setActiveWorkspaceIdCookie, clearActiveWorkspaceIdCookie, getActiveWorkspaceIdCookie } from "@/lib/workspace";
import type { InviteRole } from "@/types/database";

export interface ActionResult {
  error?: string;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  role: z.enum(["admin", "editor", "viewer"]),
});

export interface InviteMemberResult extends ActionResult {
  /** True if Supabase sent the invited address its own account-setup email directly (they had no Constory account yet). */
  emailSent?: boolean;
  /** Present when emailSent is false — an existing account was found, so nothing was emailed; share this link yourself instead. */
  inviteLink?: string;
}

/**
 * Invites someone to the current workspace by email. Two delivery paths,
 * chosen automatically based on whether the address already has a Constory
 * account (there's no transactional email provider configured beyond
 * Supabase's own built-in auth emails, and those only fire for Supabase's
 * own "invite a new user" flow):
 *   - No existing account: Supabase's admin.inviteUserByEmail sends them a
 *     real email with a magic link that creates their account and signs
 *     them in, landing on the accept-invite page automatically.
 *   - Existing account: nothing can be auto-emailed to them, so this
 *     returns a plain shareable link (app/invite/[token]/page.tsx) for the
 *     inviter to send however they like (Slack, email, etc).
 * Either way, the workspace_invites row itself is what actually matters —
 * the email step is best-effort and never blocks the invite from existing.
 */
export async function inviteMemberAction(email: string, role: InviteRole): Promise<InviteMemberResult> {
  const parsed = inviteSchema.safeParse({ email, role });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return { error: "No active workspace." };

  // App-level check as defense in depth, same pattern used elsewhere in this
  // codebase (see switchWorkspace in services/workspace-service.ts) — the
  // RLS insert policy (workspace_invites_insert_admin, migration 0021)
  // enforces the same rule at the database level regardless.
  const callerRole = await getWorkspaceMembership(supabase, user.id, workspace.id);
  if (callerRole !== "owner" && callerRole !== "admin") {
    return { error: "Only the workspace owner or an admin can invite members." };
  }

  let invite;
  try {
    invite = await createInvite(supabase, workspace.id, user.id, parsed.data.email, parsed.data.role);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "We couldn't create that invite. Please try again." };
  }

  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invite.token}`;

  const admin = createAdminClient();
  let alreadyHasAccount = false;
  try {
    const { data: users } = await admin.auth.admin.listUsers();
    alreadyHasAccount = !!users?.users.some((u) => u.email?.toLowerCase() === parsed.data.email);
  } catch {
    // If we can't tell, err toward NOT sending a Supabase invite email to an
    // address that might already have an account (that call would just fail
    // anyway) — fall back to a shareable link either way.
    alreadyHasAccount = true;
  }

  revalidatePath("/app/settings/team");

  if (alreadyHasAccount) {
    return { emailSent: false, inviteLink };
  }

  try {
    await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=${encodeURIComponent(`/invite/${invite.token}`)}`,
    });
    return { emailSent: true };
  } catch {
    // The invite itself was created successfully above — only the email
    // failed to send. Fall back to a shareable link rather than reporting
    // an error for something that actually worked.
    return { emailSent: false, inviteLink };
  }
}

export async function revokeInviteAction(inviteId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  try {
    await revokeInvite(supabase, inviteId);
    revalidatePath("/app/settings/team");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "We couldn't revoke that invite." };
  }
}

export async function updateMemberRoleAction(memberUserId: string, role: InviteRole): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return { error: "No active workspace." };

  try {
    await updateMemberRole(supabase, workspace.id, memberUserId, role);
    revalidatePath("/app/settings/team");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "We couldn't update that member's role." };
  }
}

export interface RemoveMemberResult extends ActionResult {
  /** Set when the caller removed themselves ("leave workspace") — where the client should navigate afterward, since their active workspace may no longer exist for them. */
  redirectTo?: string;
}

/** Removes a member — also how "leave workspace" works, when `memberUserId` is the caller's own id (see workspace_members_delete_self, migration 0021). */
export async function removeMemberAction(memberUserId: string): Promise<RemoveMemberResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return { error: "No active workspace." };

  try {
    await removeMember(supabase, workspace.id, memberUserId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "We couldn't remove that member." };
  }

  revalidatePath("/app/settings/team");
  revalidatePath("/app", "layout");

  if (memberUserId !== user.id) return {};

  // The caller just left their own active workspace — same cookie
  // re-pointing deleteWorkspaceAction does in app/app/(shell)/settings/actions.ts.
  const activeId = await getActiveWorkspaceIdCookie();
  const remaining = await getUserWorkspaces(supabase);
  if (activeId === workspace.id) {
    if (remaining.length > 0) {
      await setActiveWorkspaceIdCookie(remaining[0].id);
    } else {
      await clearActiveWorkspaceIdCookie();
    }
  }
  return { redirectTo: remaining.length > 0 ? "/app" : "/app/onboarding" };
}
