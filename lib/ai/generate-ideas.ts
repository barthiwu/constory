import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient, AI_MODEL_FAST, toAIGenerationError, AIGenerationError } from "@/lib/ai/client";
import { aiIdeasSchema, type AIIdeasOutput } from "@/lib/ai/schemas";
import { CONTENT_FORMAT_OPTIONS } from "@/lib/constants";
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
- For every idea also suggest: recommended_platforms — an array of one or more platforms this idea genuinely
  suits (from the brand's selected platforms if any are given, otherwise your best judgment). Most ideas fit more
  than one platform reasonably well; only recommend a single platform when the idea is genuinely
  platform-specific (e.g. a format only one platform supports). Use an empty array only if truly no platform
  fits. Also suggest a recommended_format appropriate to the primary platform, a short content_objective (e.g.
  "Educate", "Engage", "Promote", "Generate leads", "Build authority"), and an optional suggested_hook — a
  one-line opening/angle that would stop the scroll. Use null for format/objective/hook if you genuinely can't
  recommend one.
- recommended_format must be exactly one of: ${CONTENT_FORMAT_OPTIONS.map((f) => `"${f}"`).join(", ")}. Pick
  whichever fits the idea best -- never invent a different label.
- Ground every idea in the actual current date given in the context below — never propose "trends", "this year"
  content, or time-sensitive angles (e.g. year-specific predictions, seasonal tie-ins) dated to any year other
  than the current one.
- Respond only with the structured output requested.`;

export interface GenerateIdeasParams {
  count: number;
  focusPillarName?: string;
  platform?: string;
  objective?: string;
  format?: string;
}

export async function generateIdeas(ctx: AIContext, params: GenerateIdeasParams): Promise<AIIdeasOutput> {
  const client = getOpenAIClient();
  const contextBlock = renderBrandContextBlock(ctx);

  const existingBlock =
    ctx.existing.ideaTitles.length > 0 || ctx.existing.recentPostTitles.length > 0
      ? `\n\nExisting ideas and recent post titles (do not repeat these):\n${[...ctx.existing.ideaTitles, ...ctx.existing.recentPostTitles].slice(0, 60).map((t) => `- ${t}`).join("\n")}`
      : "";

  const focusLine = params.focusPillarName ? `\n\nFocus specifically on the "${params.focusPillarName}" pillar.` : "";
  const platformLine = params.platform ? `\n\nEvery idea's recommended_platforms must include "${params.platform}".` : "";
  const objectiveLine = params.objective ? `\n\nEvery idea should serve this content objective: "${params.objective}".` : "";
  const formatLine = params.format ? `\n\nFocus recommended_format on "${params.format}" for every idea.` : "";

  try {
    const completion = await client.chat.completions.parse({
      model: AI_MODEL_FAST,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${contextBlock}${existingBlock}${focusLine}${platformLine}${objectiveLine}${formatLine}\n\nGenerate ${params.count} new content ideas now.`,
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
