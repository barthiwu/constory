"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateWorkspace } from "@/services/workspace-service";
import { z } from "zod";

export interface ActionResult {
  error?: string;
}

const profileSchema = z.object({ full_name: z.string().trim().min(1, "Name is required").max(120) });

export async function updateProfileAction(fullName: string): Promise<ActionResult> {
  const parsed = profileSchema.safeParse({ full_name: fullName });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", user.id);
  if (error) return { error: "We couldn't update your profile. Please try again." };
  revalidatePath("/app", "layout");
  return {};
}

const workspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function updateWorkspaceSettingsAction(
  workspaceId: string,
  input: { name: string; description?: string },
): Promise<ActionResult> {
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  try {
    await updateWorkspace(supabase, workspaceId, { name: parsed.data.name, description: parsed.data.description || null });
    revalidatePath("/app", "layout");
    return {};
  } catch {
    return { error: "We couldn't update your workspace. Please try again." };
  }
}

const passwordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").regex(/[A-Za-z]/).regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

export async function changePasswordAction(password: string, confirmPassword: string): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse({ password, confirmPassword });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "We couldn't update your password. Please try again." };
  return {};
}
