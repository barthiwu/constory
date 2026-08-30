import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ContentStrategy, ContentPillar, ContentMixItem, StrategySource } from "@/types/database";

type DB = SupabaseClient<Database>;

export async function getStrategy(supabase: DB, workspaceId: string): Promise<ContentStrategy | null> {
  const { data, error } = await supabase
    .from("content_strategies")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ContentStrategy | null;
}

export async function getPillars(supabase: DB, strategyId: string): Promise<ContentPillar[]> {
  const { data, error } = await supabase
    .from("content_pillars")
    .select("*")
    .eq("strategy_id", strategyId)
    .order("recommended_percentage", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface SaveStrategyInput {
  strategy_summary: string;
  monthly_theme?: string | null;
  content_mix: ContentMixItem[];
  source: StrategySource;
  pillars: Array<{ name: string; description: string; recommended_percentage: number; source: StrategySource }>;
}

/**
 * Persists a freshly generated (or edited) strategy as a new strategy row plus
 * its pillars. We keep prior strategies in the table (rather than update-in-place)
 * so the workspace has a natural history; getStrategy always returns the latest.
 */
export async function saveStrategy(supabase: DB, workspaceId: string, input: SaveStrategyInput): Promise<ContentStrategy> {
  const { data: strategy, error: strategyError } = await supabase
    .from("content_strategies")
    .insert({
      workspace_id: workspaceId,
      strategy_summary: input.strategy_summary,
      monthly_theme: input.monthly_theme ?? null,
      content_mix: input.content_mix,
      source: input.source,
    })
    .select("*")
    .single();
  if (strategyError) throw strategyError;

  if (input.pillars.length > 0) {
    const { error: pillarsError } = await supabase.from("content_pillars").insert(
      input.pillars.map((p) => ({
        strategy_id: strategy.id,
        workspace_id: workspaceId,
        name: p.name,
        description: p.description,
        recommended_percentage: p.recommended_percentage,
        source: p.source,
      })),
    );
    if (pillarsError) throw pillarsError;
  }

  return strategy as ContentStrategy;
}

export async function updateStrategySummary(
  supabase: DB,
  strategyId: string,
  input: { strategy_summary?: string; monthly_theme?: string | null; content_mix?: ContentMixItem[] },
): Promise<ContentStrategy> {
  const { data, error } = await supabase
    .from("content_strategies")
    .update({ ...input, source: "AI_EDITED" })
    .eq("id", strategyId)
    .select("*")
    .single();
  if (error) throw error;
  return data as ContentStrategy;
}

export interface UpdatePillarInput {
  name?: string;
  description?: string;
  recommended_percentage?: number;
}

export async function updatePillar(supabase: DB, pillarId: string, input: UpdatePillarInput): Promise<ContentPillar> {
  const { data, error } = await supabase
    .from("content_pillars")
    .update({ ...input, source: "AI_EDITED" })
    .eq("id", pillarId)
    .select("*")
    .single();
  if (error) throw error;
  return data as ContentPillar;
}

export async function createPillar(
  supabase: DB,
  workspaceId: string,
  strategyId: string,
  input: { name: string; description: string; recommended_percentage: number },
): Promise<ContentPillar> {
  const { data, error } = await supabase
    .from("content_pillars")
    .insert({ workspace_id: workspaceId, strategy_id: strategyId, ...input, source: "USER" })
    .select("*")
    .single();
  if (error) throw error;
  return data as ContentPillar;
}

export async function deletePillar(supabase: DB, pillarId: string): Promise<void> {
  const { error } = await supabase.from("content_pillars").delete().eq("id", pillarId);
  if (error) throw error;
}
