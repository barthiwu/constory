import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getBrandProfile, getProductsServices } from "@/services/brand-service";
import { getStrategy, getPillars } from "@/services/strategy-service";
import { getIdeas } from "@/services/content-service";
import { getWorkspace } from "@/services/workspace-service";
import { goalLabel, voiceLabel } from "@/lib/constants";

type DB = SupabaseClient<Database>;

export interface BrandContext {
  workspaceName: string;
  industry: string | null;
  website: string | null;
  businessDescription: string;
  products: Array<{ name: string; description: string; category: string | null }>;
  targetAudience: string;
  audienceAgeRange: string | null;
  audienceLocations: string | null;
  audienceInterests: string | null;
  audienceProblems: string | null;
  primaryGoal: string | null;
  secondaryGoals: string[];
  brandVoiceTraits: string[];
  brandVoice: string;
  platforms: string[];
}

export interface StrategyContext {
  summary: string | null;
  monthlyTheme: string | null;
  pillars: Array<{ id: string; name: string; description: string; percentage: number }>;
}

export interface ExistingContentContext {
  ideaTitles: string[];
  recentPostTitles: string[];
}

export interface AIContext {
  brand: BrandContext;
  strategy: StrategyContext;
  existing: ExistingContentContext;
}

/**
 * Assembles the full structured context the AI layer works from. Every
 * generation function receives this object rather than raw database rows —
 * it is the single place that knows how to translate our schema into
 * something worth handing to a model.
 */
export async function buildAIContext(supabase: DB, workspaceId: string): Promise<AIContext> {
  const [workspace, brandProfile, products, strategy] = await Promise.all([
    getWorkspace(supabase, workspaceId),
    getBrandProfile(supabase, workspaceId),
    getProductsServices(supabase, workspaceId),
    getStrategy(supabase, workspaceId),
  ]);

  const [pillars, ideas] = await Promise.all([
    strategy ? getPillars(supabase, strategy.id) : Promise.resolve([]),
    getIdeas(supabase, workspaceId),
  ]);

  // Recent post titles across the workspace's calendars, for duplicate-concept checking.
  const { data: recentPosts } = await supabase
    .from("calendar_posts")
    .select("title, content_calendars!inner(workspace_id)")
    .eq("content_calendars.workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  return {
    brand: {
      workspaceName: workspace?.name ?? "This brand",
      industry: workspace?.industry ?? null,
      website: workspace?.website ?? null,
      businessDescription: brandProfile?.business_description ?? "",
      products: products.map((p) => ({ name: p.name, description: p.description, category: p.category })),
      targetAudience: brandProfile?.target_audience ?? "",
      audienceAgeRange: brandProfile?.audience_age_range ?? null,
      audienceLocations: brandProfile?.audience_locations ?? null,
      audienceInterests: brandProfile?.audience_interests ?? null,
      audienceProblems: brandProfile?.audience_problems ?? null,
      primaryGoal: brandProfile?.primary_goal ? goalLabel(brandProfile.primary_goal) : null,
      secondaryGoals: (brandProfile?.secondary_goals ?? []).map((g) => goalLabel(g)),
      brandVoiceTraits: (brandProfile?.brand_voice_traits ?? []).map((t) => voiceLabel(t)),
      brandVoice: brandProfile?.brand_voice ?? "",
      platforms: brandProfile?.selected_platforms ?? [],
    },
    strategy: {
      summary: strategy?.strategy_summary ?? null,
      monthlyTheme: strategy?.monthly_theme ?? null,
      pillars: pillars.map((p) => ({ id: p.id, name: p.name, description: p.description, percentage: p.recommended_percentage })),
    },
    existing: {
      ideaTitles: ideas.map((i) => i.title),
      recentPostTitles: ((recentPosts ?? []) as Array<{ title: string }>).map((p) => p.title),
    },
  };
}

/** Renders the brand+strategy portion of the context as prompt-ready text, shared by every prompt builder. */
export function renderBrandContextBlock(ctx: AIContext): string {
  const { brand, strategy } = ctx;
  const lines: string[] = [];
  lines.push(`Brand: ${brand.workspaceName}`);
  if (brand.industry) lines.push(`Industry: ${brand.industry}`);
  if (brand.businessDescription) lines.push(`Business description: ${brand.businessDescription}`);
  if (brand.products.length > 0) {
    lines.push(
      `Products/services: ${brand.products.map((p) => `${p.name} — ${p.description}`).join("; ")}`,
    );
  }
  if (brand.targetAudience) lines.push(`Target audience: ${brand.targetAudience}`);
  if (brand.audienceAgeRange) lines.push(`Audience age range: ${brand.audienceAgeRange}`);
  if (brand.audienceLocations) lines.push(`Audience locations: ${brand.audienceLocations}`);
  if (brand.audienceInterests) lines.push(`Audience interests: ${brand.audienceInterests}`);
  if (brand.audienceProblems) lines.push(`Audience challenges: ${brand.audienceProblems}`);
  if (brand.primaryGoal) lines.push(`Primary business goal: ${brand.primaryGoal}`);
  if (brand.secondaryGoals.length > 0) lines.push(`Secondary goals: ${brand.secondaryGoals.join(", ")}`);
  if (brand.brandVoiceTraits.length > 0) lines.push(`Brand voice traits: ${brand.brandVoiceTraits.join(", ")}`);
  if (brand.brandVoice) lines.push(`Brand voice description: ${brand.brandVoice}`);
  if (brand.platforms.length > 0) lines.push(`Platforms: ${brand.platforms.join(", ")}`);

  if (strategy.summary) {
    lines.push("");
    lines.push(`Existing content strategy: ${strategy.summary}`);
    if (strategy.monthlyTheme) lines.push(`Current monthly theme: ${strategy.monthlyTheme}`);
    if (strategy.pillars.length > 0) {
      lines.push(
        `Content pillars: ${strategy.pillars.map((p) => `${p.name} (${p.percentage}%) — ${p.description}`).join("; ")}`,
      );
    }
  }

  return lines.join("\n");
}
