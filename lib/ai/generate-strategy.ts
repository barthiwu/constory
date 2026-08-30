import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient, AI_MODEL_STRATEGY, toAIGenerationError, AIGenerationError } from "@/lib/ai/client";
import { aiStrategySchema, type AIStrategyOutput } from "@/lib/ai/schemas";
import { renderBrandContextBlock, type AIContext } from "@/lib/ai/context";
import { normalizeToHundred } from "@/lib/ai/distribution";

const SYSTEM_PROMPT = `You are Constory's content strategy engine. You turn a business's brand information into a
practical, specific content strategy — not generic marketing advice. You think like an experienced content
strategist who understands the brand's audience and business goals, and you translate that understanding into
a small number of clear content pillars that a real team could execute against.

Rules:
- Produce between 3 and 6 content pillars. Fewer, sharper pillars beat many vague ones.
- Each pillar needs a name (2-4 words), a one-to-two sentence description of what it covers and why it matters
  for this brand's goals, and a recommended percentage of overall content volume.
- Percentages should sum to approximately 100.
- The strategy summary should read like a short brief a founder could actually use: what the content is for,
  and how the pillars work together to get there.
- Ground every recommendation in the specific brand, audience, and goals provided — avoid generic filler like
  "post consistently" or "engage with your audience" with no specifics attached.
- Respond only with the structured output requested.`;

export interface GenerateStrategyResult {
  strategy: AIStrategyOutput;
}

export async function generateStrategy(ctx: AIContext): Promise<GenerateStrategyResult> {
  const client = getOpenAIClient();
  const contextBlock = renderBrandContextBlock(ctx);

  if (!ctx.brand.businessDescription && !ctx.brand.targetAudience) {
    throw new AIGenerationError(
      "We need at least a business description and target audience before we can build a strategy.",
      { retryable: false },
    );
  }

  try {
    const completion = await client.chat.completions.parse({
      model: AI_MODEL_STRATEGY,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Build a content strategy for this brand:\n\n${contextBlock}\n\nGenerate the strategy now.`,
        },
      ],
      response_format: zodResponseFormat(aiStrategySchema, "content_strategy"),
      temperature: 0.6,
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new AIGenerationError("The AI didn't return a usable strategy. Please try again.");
    }

    const normalized = normalizeToHundred(parsed.pillars.map((p) => p.recommended_percentage));
    const strategy: AIStrategyOutput = {
      ...parsed,
      pillars: parsed.pillars.map((p, i) => ({ ...p, recommended_percentage: normalized[i] })),
    };

    return { strategy };
  } catch (err) {
    throw toAIGenerationError(err, "We couldn't generate your strategy right now. Your existing information is safe.");
  }
}
