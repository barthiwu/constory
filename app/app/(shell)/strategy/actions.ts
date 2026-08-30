"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateStrategySummary, updatePillar, createPillar, deletePillar } from "@/services/strategy-service";
import type { ContentMixItem } from "@/types/database";

export interface ActionResult {
  error?: string;
}

export async function updateStrategySummaryAction(
  strategyId: string,
  input: { strategy_summary?: string; monthly_theme?: string | null; content_mix?: ContentMixItem[] },
): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await updateStrategySummary(supabase, strategyId, input);
    revalidatePath("/app/strategy");
    return {};
  } catch {
    return { error: "We couldn't save your changes. Please try again." };
  }
}

export async function updatePillarAction(
  pillarId: string,
  input: { name?: string; description?: string; recommended_percentage?: number },
): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await updatePillar(supabase, pillarId, input);
    revalidatePath("/app/strategy");
    return {};
  } catch {
    return { error: "We couldn't save that pillar. Please try again." };
  }
}

export async function createPillarAction(
  workspaceId: string,
  strategyId: string,
  input: { name: string; description: string; recommended_percentage: number },
): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await createPillar(supabase, workspaceId, strategyId, input);
    revalidatePath("/app/strategy");
    return {};
  } catch {
    return { error: "We couldn't add that pillar. Please try again." };
  }
}

export async function deletePillarAction(pillarId: string): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await deletePillar(supabase, pillarId);
    revalidatePath("/app/strategy");
    return {};
  } catch {
    return { error: "We couldn't remove that pillar. Please try again." };
  }
}
