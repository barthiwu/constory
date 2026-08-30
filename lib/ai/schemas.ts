import { z } from "zod";

// ---------------------------------------------------------------------------
// Strategy generation
// ---------------------------------------------------------------------------
export const aiPillarSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  recommended_percentage: z.number().int().min(0).max(100),
});

export const aiStrategySchema = z.object({
  strategy_summary: z.string().min(1).max(2000),
  monthly_theme: z.string().max(200).nullable(),
  pillars: z.array(aiPillarSchema).min(3).max(6),
  strategic_recommendations: z.array(z.string().max(400)).max(6),
});
export type AIStrategyOutput = z.infer<typeof aiStrategySchema>;

// ---------------------------------------------------------------------------
// Ideas generation
// ---------------------------------------------------------------------------
export const aiIdeaSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(600),
  pillar_name: z.string().max(80).nullable(),
  recommended_platform: z.string().max(40).nullable(),
  recommended_format: z.string().max(80).nullable(),
  content_objective: z.string().max(120).nullable(),
  suggested_hook: z.string().max(300).nullable(),
});

export const aiIdeasSchema = z.object({
  ideas: z.array(aiIdeaSchema).min(1).max(20),
});
export type AIIdeasOutput = z.infer<typeof aiIdeasSchema>;

// ---------------------------------------------------------------------------
// Calendar topic generation (stage 4 of the calendar engine)
// ---------------------------------------------------------------------------
export const aiTopicSchema = z.object({
  reference: z.string().min(1).max(40),
  title: z.string().min(1).max(160),
  pillar_name: z.string().min(1).max(80),
  platform: z.string().min(1).max(40),
  objective: z.string().min(1).max(120),
  format: z.string().min(1).max(80),
});

export const aiTopicsSchema = z.object({
  topics: z.array(aiTopicSchema).min(1).max(60),
});
export type AITopicsOutput = z.infer<typeof aiTopicsSchema>;

// ---------------------------------------------------------------------------
// Post detail generation (stage 7 of the calendar engine, and single-post regen)
// ---------------------------------------------------------------------------
export const aiPostDetailSchema = z.object({
  brief: z.string().min(1).max(1200),
  hook: z.string().min(1).max(300),
  caption: z.string().min(1).max(2200),
  cta: z.string().min(1).max(200),
  hashtags: z.array(z.string().max(40)).max(15),
  creative_direction: z.string().min(1).max(1200),
});
export type AIPostDetailOutput = z.infer<typeof aiPostDetailSchema>;

export const aiBatchPostDetailsSchema = z.object({
  posts: z.array(aiPostDetailSchema.extend({ reference: z.string().min(1).max(40) })).min(1).max(60),
});
export type AIBatchPostDetailsOutput = z.infer<typeof aiBatchPostDetailsSchema>;

// ---------------------------------------------------------------------------
// Granular regeneration
// ---------------------------------------------------------------------------
export const aiTopicRegenSchema = z.object({
  title: z.string().min(1).max(160),
  brief: z.string().min(1).max(1200),
  hook: z.string().min(1).max(300),
});
export type AITopicRegenOutput = z.infer<typeof aiTopicRegenSchema>;

export const aiCaptionRegenSchema = z.object({
  caption: z.string().min(1).max(2200),
  cta: z.string().min(1).max(200),
  hashtags: z.array(z.string().max(40)).max(15),
});
export type AICaptionRegenOutput = z.infer<typeof aiCaptionRegenSchema>;

export const aiFieldRegenSchema = z.object({
  value: z.string().min(1).max(2200),
});
export type AIFieldRegenOutput = z.infer<typeof aiFieldRegenSchema>;

export const aiDuplicateCheckSchema = z.object({
  duplicate_references: z.array(z.string()),
});
export type AIDuplicateCheckOutput = z.infer<typeof aiDuplicateCheckSchema>;
