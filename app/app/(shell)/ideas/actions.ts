"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createIdea, bulkCreateIdeas, updateIdea, deleteIdea, duplicateIdea, addIdeaToCalendar, type IdeaInput } from "@/services/content-service";
import type { IdeaStatus } from "@/types/database";

export interface ActionResult {
  error?: string;
}

/**
 * Persists whichever AI-generated idea drafts the user selected to keep
 * (see components/content/ideas-view.tsx) — the generation endpoint itself
 * never writes to content_ideas; this explicit, user-triggered save is what
 * does, satisfying the "generate, review, save" flow for every idea.
 */
export async function saveGeneratedIdeasAction(workspaceId: string, ideas: IdeaInput[]): Promise<ActionResult & { count?: number }> {
  const supabase = await createClient();
  try {
    const saved = await bulkCreateIdeas(supabase, workspaceId, ideas);
    revalidatePath("/app/ideas");
    revalidatePath("/app/dashboard");
    return { count: saved.length };
  } catch {
    return { error: "We couldn't save those ideas. Please try again." };
  }
}

export async function createIdeaAction(workspaceId: string, input: IdeaInput): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await createIdea(supabase, workspaceId, input, "USER");
    revalidatePath("/app/ideas");
    return {};
  } catch {
    return { error: "We couldn't save that idea. Please try again." };
  }
}

export async function updateIdeaAction(ideaId: string, input: Partial<IdeaInput & { status: IdeaStatus }>): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await updateIdea(supabase, ideaId, input);
    revalidatePath("/app/ideas");
    return {};
  } catch {
    return { error: "We couldn't save that idea. Please try again." };
  }
}

export async function deleteIdeaAction(ideaId: string): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await deleteIdea(supabase, ideaId);
    revalidatePath("/app/ideas");
    return {};
  } catch {
    return { error: "We couldn't remove that idea. Please try again." };
  }
}

export async function duplicateIdeaAction(ideaId: string): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  try {
    const copy = await duplicateIdea(supabase, ideaId);
    revalidatePath("/app/ideas");
    return { id: copy.id };
  } catch {
    return { error: "We couldn't duplicate that idea. Please try again." };
  }
}

export async function addIdeaToCalendarAction(
  ideaId: string,
  calendarId: string,
  scheduledDate: string,
  platform: string,
): Promise<ActionResult & { postId?: string }> {
  const supabase = await createClient();
  try {
    const { data: idea, error } = await supabase.from("content_ideas").select("*").eq("id", ideaId).single();
    if (error || !idea) return { error: "That idea couldn't be found." };
    const post = await addIdeaToCalendar(supabase, idea, calendarId, scheduledDate, platform);
    revalidatePath("/app/ideas");
    revalidatePath(`/app/calendars/${calendarId}`);
    return { postId: post.id };
  } catch {
    return { error: "We couldn't add that idea to the calendar. Please try again." };
  }
}
