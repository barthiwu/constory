import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient, AI_MODEL_FAST, toAIGenerationError, AIGenerationError } from "@/lib/ai/client";
import {
  aiTopicRegenSchema,
  aiCaptionRegenSchema,
  aiFieldRegenSchema,
  type AITopicRegenOutput,
  type AICaptionRegenOutput,
} from "@/lib/ai/schemas";
import { renderBrandContextBlock, type AIContext } from "@/lib/ai/context";
import { type ImproveOption } from "@/lib/ai/improve-options";
import type { CalendarPost } from "@/types/database";

const IMPROVE_INSTRUCTIONS: Record<ImproveOption, string> = {
  more_professional: "Rewrite it to sound more professional and polished, while staying true to the brand voice.",
  more_conversational: "Rewrite it to sound more conversational and personable.",
  more_engaging: "Rewrite it to be more attention-grabbing and engaging, with a stronger opening.",
  shorter: "Rewrite it to be noticeably shorter and more concise, keeping the core message.",
  longer: "Expand it with more detail and substance, while staying focused and not padding it.",
  more_educational: "Rewrite it to lead with a useful insight or teaching moment for the audience.",
  more_promotional: "Rewrite it to more directly highlight the product/service and drive action.",
};

function postSummary(post: Pick<CalendarPost, "title" | "platform" | "format" | "objective" | "caption" | "hook" | "brief">) {
  return `Post title: "${post.title}"\nPlatform: ${post.platform}\nFormat: ${post.format ?? "unspecified"}\nObjective: ${post.objective ?? "unspecified"}${post.brief ? `\nBrief: ${post.brief}` : ""}`;
}

/** Regenerate Topic — replaces title, brief, hook while keeping pillar/platform/format/objective. */
export async function regenerateTopic(ctx: AIContext, post: CalendarPost): Promise<AITopicRegenOutput> {
  const client = getOpenAIClient();
  try {
    const completion = await client.chat.completions.parse({
      model: AI_MODEL_FAST,
      messages: [
        {
          role: "system",
          content:
            "You are Constory's content writer. Generate a fresh title, brief, and hook for a content post, keeping the same pillar, platform, format, and objective, but a genuinely different angle from the current one. Respond only with the structured output requested.",
        },
        {
          role: "user",
          content: `${renderBrandContextBlock(ctx)}\n\nCurrent post:\n${postSummary(post)}\n\nGenerate a new title, brief, and hook with a different angle.`,
        },
      ],
      response_format: zodResponseFormat(aiTopicRegenSchema, "topic_regen"),
      temperature: 0.85,
    });
    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new AIGenerationError("The AI didn't return a usable topic. Please try again.");
    return parsed;
  } catch (err) {
    throw toAIGenerationError(err, "We couldn't regenerate this topic right now. The current content is unchanged.");
  }
}

/** Alternative Angle — same general subject, different approach. */
export async function generateAlternativeAngle(ctx: AIContext, post: CalendarPost): Promise<AITopicRegenOutput> {
  const client = getOpenAIClient();
  try {
    const completion = await client.chat.completions.parse({
      model: AI_MODEL_FAST,
      messages: [
        {
          role: "system",
          content:
            "You are Constory's content writer. Keep the same general subject as the post below, but approach it from a meaningfully different angle (a different structure, hook, or perspective) — do not just reword it. Respond only with the structured output requested.",
        },
        {
          role: "user",
          content: `${renderBrandContextBlock(ctx)}\n\nCurrent post:\n${postSummary(post)}\n\nGenerate an alternative angle on the same subject.`,
        },
      ],
      response_format: zodResponseFormat(aiTopicRegenSchema, "alternative_angle"),
      temperature: 0.8,
    });
    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new AIGenerationError("The AI didn't return a usable alternative. Please try again.");
    return parsed;
  } catch (err) {
    throw toAIGenerationError(err, "We couldn't generate an alternative angle right now. The current content is unchanged.");
  }
}

/** Regenerate Caption — replaces caption, cta, and hashtags. */
export async function regenerateCaption(ctx: AIContext, post: CalendarPost): Promise<AICaptionRegenOutput> {
  const client = getOpenAIClient();
  try {
    const completion = await client.chat.completions.parse({
      model: AI_MODEL_FAST,
      messages: [
        {
          role: "system",
          content:
            "You are Constory's caption writer. Write a fresh caption, call-to-action, and hashtag set for the post below, in the brand's voice. Keep the same subject/title/brief. Respond only with the structured output requested.",
        },
        {
          role: "user",
          content: `${renderBrandContextBlock(ctx)}\n\nCurrent post:\n${postSummary(post)}${post.hook ? `\nHook: ${post.hook}` : ""}\n\nGenerate a new caption, CTA, and hashtags.`,
        },
      ],
      response_format: zodResponseFormat(aiCaptionRegenSchema, "caption_regen"),
      temperature: 0.8,
    });
    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new AIGenerationError("The AI didn't return a usable caption. Please try again.");
    return parsed;
  } catch (err) {
    throw toAIGenerationError(err, "We couldn't regenerate this caption right now. The current content is unchanged.");
  }
}

/** Improve — rewrites a single field (typically the caption) per one of the tone/length options. */
export async function improveField(
  ctx: AIContext,
  post: CalendarPost,
  field: "caption" | "hook" | "cta" | "creative_direction",
  option: ImproveOption,
): Promise<string> {
  const client = getOpenAIClient();
  const currentValue = post[field] ?? "";
  if (!currentValue) {
    throw new AIGenerationError("There's nothing here yet to improve — generate content for this post first.", {
      retryable: false,
    });
  }

  try {
    const completion = await client.chat.completions.parse({
      model: AI_MODEL_FAST,
      messages: [
        {
          role: "system",
          content:
            "You are Constory's content editor. Rewrite the given text per the instruction, preserving its core meaning and staying in the brand's voice. Respond only with the structured output requested.",
        },
        {
          role: "user",
          content: `${renderBrandContextBlock(ctx)}\n\nCurrent ${field.replace("_", " ")}:\n${currentValue}\n\nInstruction: ${IMPROVE_INSTRUCTIONS[option]}`,
        },
      ],
      response_format: zodResponseFormat(aiFieldRegenSchema, "field_regen"),
      temperature: 0.7,
    });
    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new AIGenerationError("The AI didn't return usable text. Please try again.");
    return parsed.value;
  } catch (err) {
    throw toAIGenerationError(err, "We couldn't improve this right now. The current content is unchanged.");
  }
}

/** Regenerate a single hashtag/hook/cta-style short field from scratch (not an "improve", a fresh take). */
export async function regenerateField(
  ctx: AIContext,
  post: CalendarPost,
  field: "hook" | "cta" | "creative_direction",
): Promise<string> {
  const client = getOpenAIClient();
  try {
    const completion = await client.chat.completions.parse({
      model: AI_MODEL_FAST,
      messages: [
        {
          role: "system",
          content: `You are Constory's content writer. Write a fresh ${field.replace("_", " ")} for the post below, in the brand's voice. Respond only with the structured output requested.`,
        },
        {
          role: "user",
          content: `${renderBrandContextBlock(ctx)}\n\nPost:\n${postSummary(post)}${post.caption ? `\nCurrent caption: ${post.caption}` : ""}`,
        },
      ],
      response_format: zodResponseFormat(aiFieldRegenSchema, "field_regen"),
      temperature: 0.8,
    });
    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new AIGenerationError("The AI didn't return usable text. Please try again.");
    return parsed.value;
  } catch (err) {
    throw toAIGenerationError(err, "We couldn't regenerate this right now. The current content is unchanged.");
  }
}
