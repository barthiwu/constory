"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { switchWorkspace, createWorkspace, type CreateWorkspaceInput } from "@/services/workspace-service";

export async function switchWorkspaceAction(workspaceId: string): Promise<void> {
  await switchWorkspace(workspaceId);
  revalidatePath("/app", "layout");
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
