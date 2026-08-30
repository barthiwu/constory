import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ContentIdea, IdeaStatus } from "@/types/database";
import { createPost, type CreatePostInput } from "@/services/calendar-service";

type DB = SupabaseClient<Database>;

export async function getIdeas(supabase: DB, workspaceId: string, status?: IdeaStatus): Promise<ContentIdea[]> {
  let query = supabase.from("content_ideas").select("*").eq("workspace_id", workspaceId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface IdeaInput {
  title: string;
  description?: string;
  content_pillar_id?: string | null;
}

export async function createIdea(
  supabase: DB,
  workspaceId: string,
  input: IdeaInput,
  source: "AI" | "USER" = "USER",
): Promise<ContentIdea> {
  const { data, error } = await supabase
    .from("content_ideas")
    .insert({ workspace_id: workspaceId, ...input, source })
    .select("*")
    .single();
  if (error) throw error;
  return data as ContentIdea;
}

export async function bulkCreateIdeas(
  supabase: DB,
  workspaceId: string,
  ideas: IdeaInput[],
): Promise<ContentIdea[]> {
  if (ideas.length === 0) return [];
  const { data, error } = await supabase
    .from("content_ideas")
    .insert(ideas.map((i) => ({ workspace_id: workspaceId, ...i, source: "AI" as const })))
    .select("*");
  if (error) throw error;
  return (data ?? []) as ContentIdea[];
}

export async function updateIdea(supabase: DB, ideaId: string, input: Partial<IdeaInput & { status: IdeaStatus }>): Promise<ContentIdea> {
  const { data, error } = await supabase.from("content_ideas").update(input).eq("id", ideaId).select("*").single();
  if (error) throw error;
  return data as ContentIdea;
}

export async function deleteIdea(supabase: DB, ideaId: string): Promise<void> {
  const { error } = await supabase.from("content_ideas").delete().eq("id", ideaId);
  if (error) throw error;
}

/** Converts an idea into a draft calendar post and marks the idea as used. */
export async function addIdeaToCalendar(
  supabase: DB,
  idea: ContentIdea,
  calendarId: string,
  scheduledDate: string,
  platform: string,
) {
  const input: CreatePostInput = {
    content_pillar_id: idea.content_pillar_id,
    scheduled_date: scheduledDate,
    platform,
    title: idea.title,
    brief: idea.description,
    status: "draft",
  };
  const post = await createPost(supabase, calendarId, input);
  await updateIdea(supabase, idea.id, { status: "used" });
  return post;
}
