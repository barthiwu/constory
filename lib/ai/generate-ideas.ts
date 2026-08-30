import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient, AI_MODEL_FAST, toAIGenerationError, AIGenerationError } from "@/lib/ai/client";
import { aiIdeasSchema, type AIIdeasOutput } from "@/lib/ai/schemas";
import { renderBrandContextBlock, type AIContext } from "@/lib/ai/context";

const SYSTEM_PROMPT = `You are Constory's content ideation engine. You generate specific, usable content ideas for a
brand's content pillars — concrete enough that someone could start drafting from the idea alone, never generic
prompts like "share a customer story" with no particular customer or angle attached.

Rules:
- Every idea must map to one of the brand's existing content pillars when pillars are provided (use the pillar's
  exact name). If no pillars exist yet, ideas may omit pillar_name.
- Do not repeat or closely rephrase any idea or post title already listed as existing content — propose genuinely
  different angles or subjects.
- Each idea needs a short, specific title and a 1-3 sentence description of the angle and why it fits the
  audience.
- Respond only with the structured output requested.`;

export interface GenerateIdeasParams {
  count: number;
  focusPillarName?: string;
}

export async function generateIdeas(ctx: AIContext, params: GenerateIdeasParams): Promise<AIIdeasOutput> {
  const client = getOpenAIClient();
  const contextBlock = renderBrandContextBlock(ctx);

  const existingBlock =
    ctx.existing.ideaTitles.length > 0 || ctx.existing.recentPostTitles.length > 0
      ? `\n\nExisting ideas and recent post titles (do not repeat these):\n${[...ctx.existing.ideaTitles, ...ctx.existing.recentPostTitles].slice(0, 60).map((t) => `- ${t}`).join("\n")}`
      : "";

  const focusLine = params.focusPillarName ? `\n\nFocus specifically on the "${params.focusPillarName}" pillar.` : "";

  try {
    const completion = await client.chat.completions.parse({
      model: AI_MODEL_FAST,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${contextBlock}${existingBlock}${focusLine}\n\nGenerate ${params.count} new content ideas now.`,
        },
      ],
      response_format: zodResponseFormat(aiIdeasSchema, "content_ideas"),
      temperature: 0.8,
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) throw new AIGenerationError("The AI didn't return usable ideas. Please try again.");
    return parsed;
  } catch (err) {
    throw toAIGenerationError(err, "We couldn't generate ideas right now. Your existing ideas are safe.");
  }
}
