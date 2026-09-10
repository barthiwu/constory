import { z } from "zod";
import { CONTENT_FORMAT_OPTIONS } from "@/lib/constants";

/**
 * Hashtag strings as the model returns them are inconsistent about whether
 * they already include a leading "#" (and occasionally leading whitespace).
 * Every render site (e.g. components/content/post-detail-dialog.tsx) adds
 * its own "#" prefix, exactly like the manual "add a hashtag" input strips
 * one on the way in — so any tag that still carries "#" when it reaches
 * that code doubles up on screen ("##BlitzDesigns", "# #BathroomGoals").
 *
 * This can't live as a Zod `.transform()` on the hashtags schema below:
 * those schemas are also fed straight into openai/helpers/zod's
 * zodResponseFormat() to build the structured-output JSON Schema sent to
 * the model, and the OpenAI SDK throws ("Transforms cannot be represented
 * in JSON Schema") the moment a transform is present anywhere in that
 * schema — found the hard way when adding one here 502'd every AI call
 * that touches hashtags. So normalization has to happen as a plain
 * function, applied by each caller to the parsed result instead (see
 * lib/ai/regenerate.ts's regenerateCaption and
 * lib/ai/generate-calendar.ts's post-detail step).
 */
export function normalizeHashtags(tags: string[]): string[] {
  return tags.map((tag) => tag.trim().replace(/^#+/, ""));
}

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
  // Constrained to the app's own format vocabulary (lib/constants.ts) --
  // this used to be free-text, so the AI would return values like "video"
  // or "carousel post" that never matched any option in the Format
  // <Select>, leaving it stuck showing blank wherever the idea/post was
  // edited (reproduced live: every AI-generated idea and calendar post's
  // Format field rendered empty in its edit dialog despite having a real,
  // saved value). zodResponseFormat enforces this enum at the OpenAI API
  // level, so the model can no longer return anything else.
  recommended_format: z.enum(CONTENT_FORMAT_OPTIONS).nullable(),
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
  // See the matching comment on aiIdeaSchema.recommended_format above.
  format: z.enum(CONTENT_FORMAT_OPTIONS),
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
