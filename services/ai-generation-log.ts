import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, GenerationType, GenerationStatus } from "@/types/database";

type DB = SupabaseClient<Database>;

/**
 * Every AI call gets a row here — pending immediately, then completed or
 * failed once the provider responds. This gives us the audit trail required
 * by the spec and a place to look when a user reports a bad generation.
 */
export async function logGenerationStart(
  supabase: DB,
  workspaceId: string,
  userId: string,
  generationType: GenerationType,
  inputSummary: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase
    .from("ai_generations")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      generation_type: generationType,
      input_summary: inputSummary,
      status: "processing",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function logGenerationComplete(
  supabase: DB,
  generationId: string,
  outputSummary: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("ai_generations")
    .update({ status: "completed" satisfies GenerationStatus, output_summary: outputSummary })
    .eq("id", generationId);
  if (error) throw error;
}

export async function logGenerationFailed(supabase: DB, generationId: string, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from("ai_generations")
    .update({ status: "failed" satisfies GenerationStatus, error_message: errorMessage.slice(0, 2000) })
    .eq("id", generationId);
  if (error) throw error;
}
