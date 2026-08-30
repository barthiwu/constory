"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { switchWorkspace, createWorkspace, type CreateWorkspaceInput } from "@/services/workspace-service";

export async function switchWorkspaceAction(workspaceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  // Defense in depth: confirm authentication AND membership before this is allowed
  // to become the active workspace — do not rely solely on RLS protecting the
  // queries that come after. On failure, nothing is mutated (the cookie is left
  // untouched) and a safe error is returned instead.
  const result = await switchWorkspace(supabase, user.id, workspaceId);
  if (!result.ok) {
    return result;
  }

  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function createWorkspaceAction(input: CreateWorkspaceInput): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  try {
    const workspace = await createWorkspace(supabase, user.id, input);
    revalidatePath("/app", "layout");
    return { id: workspace.id };
  } catch {
    return { error: "We couldn't create your workspace. Please try again." };
  }
}
