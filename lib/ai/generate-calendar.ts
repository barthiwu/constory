import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient, AI_MODEL_FAST, AIGenerationError } from "@/lib/ai/client";
import { aiTopicsSchema, aiBatchPostDetailsSchema, type AITopicsOutput, type AIBatchPostDetailsOutput } from "@/lib/ai/schemas";
import { renderBrandContextBlock, type AIContext } from "@/lib/ai/context";
import { largestRemainderAllocate, calculatePostCount, distributeDatesAcrossRange } from "@/lib/ai/distribution";
import type { ContentPillar, ContentCalendar } from "@/types/database";
import type { CreatePostInput } from "@/services/calendar-service";

const DETAIL_BATCH_SIZE = 6;

export interface CalendarGenerationStage {
  key: string;
  label: string;
}

export const CALENDAR_GENERATION_STAGES: CalendarGenerationStage[] = [
  { key: "validate", label: "Understanding your brand..." },
  { key: "distribute", label: "Balancing your content mix..." },
  { key: "topics", label: "Finding content opportunities..." },
  { key: "duplicates", label: "Creating content ideas..." },
  { key: "dates", label: "Organizing your calendar..." },
  { key: "details", label: "Preparing your content plan..." },
];

export interface GeneratedCalendarResult {
  posts: CreatePostInput[];
  postCount: number;
  distribution: Array<{ pillarName: string; count: number }>;
}

/**
 * Stage 1 — Validate Inputs. Throws a non-retryable AIGenerationError with a
 * message safe to show directly, for anything the user needs to fix before
 * generation can proceed at all.
 */
export function validateCalendarInputs(calendar: Pick<ContentCalendar, "start_date" | "end_date" | "selected_platforms" | "posting_frequency">) {
  if (!calendar.start_date || !calendar.end_date) {
    throw new AIGenerationError("This calendar is missing a start or end date.", { retryable: false });
  }
  if (new Date(calendar.end_date) < new Date(calendar.start_date)) {
    throw new AIGenerationError("The calendar's end date is before its start date.", { retryable: false });
  }
  if (!calendar.selected_platforms || calendar.selected_platforms.length === 0) {
    throw new AIGenerationError("Select at least one platform for this calendar before generating.", { retryable: false });
  }
  if (!calendar.posting_frequency || calendar.posting_frequency < 1) {
    throw new AIGenerationError("Posting frequency must be at least 1 post per week.", { retryable: false });
  }
}

export async function generateCalendarContent(
  ctx: AIContext,
  calendar: ContentCalendar,
  pillars: ContentPillar[],
  onStage?: (stageKey: string) => void,
): Promise<GeneratedCalendarResult> {
  onStage?.("validate");
  validateCalendarInputs(calendar);

  if (pillars.length === 0) {
    throw new AIGenerationError(
      "This workspace doesn't have content pillars yet. Generate a strategy first, then create the calendar.",
      { retryable: false },
    );
  }

  // Stage 2 — Calculate number of posts.
  onStage?.("distribute");
  const postCount = calculatePostCount(calendar.start_date, calendar.end_date, calendar.posting_frequency);

  // Stage 3 — Content distribution: turn pillar percentages into post counts.
  const counts = largestRemainderAllocate(
    pillars.map((p) => p.recommended_percentage),
    postCount,
  );
  const distribution = pillars.map((p, i) => ({ pillarName: p.name, count: counts[i] }));

  // Stage 4 — Generate topics (unique, one per allocated slot).
  onStage?.("topics");
  const topics = await generateTopics(ctx, calendar, distribution);

  // Stage 5 — Duplicate protection: drop/replace anything too close to existing content.
  onStage?.("duplicates");
  const dedupedTopics = await dedupeTopics(ctx, topics);

  // Stage 6 — Assign dates across the calendar's range.
  onStage?.("dates");
  const dates = distributeDatesAcrossRange(calendar.start_date, calendar.end_date, dedupedTopics.length);
  const scheduled = dedupedTopics.map((t, i) => ({ ...t, scheduled_date: dates[i] }));

  // Stage 7 — Generate full detail for every post.
  onStage?.("details");
  const details = await generatePostDetails(ctx, calendar, scheduled);

  // Stage 8 — Validate + assemble final posts.
  const pillarByName = new Map(pillars.map((p) => [normalizeName(p.name), p]));
  const posts: CreatePostInput[] = scheduled.map((t) => {
    const detail = details.get(t.reference);
    const pillar = pillarByName.get(normalizeName(t.pillar_name));
    return {
      content_pillar_id: pillar?.id ?? null,
      scheduled_date: t.scheduled_date,
      platform: t.platform,
      title: t.title,
      format: t.format,
      objective: t.objective,
      brief: detail?.brief ?? null,
      hook: detail?.hook ?? null,
      caption: detail?.caption ?? null,
      cta: detail?.cta ?? null,
      hashtags: detail?.hashtags ?? [],
      creative_direction: detail?.creative_direction ?? null,
      status: "draft",
    };
  });

  return { posts, postCount: posts.length, distribution };
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Stage 4 — topic generation
// ---------------------------------------------------------------------------

const TOPICS_SYSTEM_PROMPT = `You are Constory's calendar topic generator. You produce a batch of distinct content
topics for a content calendar, following an exact allocation across content pillars.

Rules:
- Produce exactly the number of topics requested for each pillar — no more, no fewer.
- Every topic must be genuinely distinct from every other topic in this batch, and from any existing content
  listed. Do not create near-duplicates (same subject with slightly different wording).
- Choose one platform per topic from the calendar's selected platforms, and a format appropriate to it.
- Assign a "reference" to each topic as "p{n}" where n is a running 1-based index across the whole batch, e.g.
  p1, p2, p3 — these must be unique.
- Respond only with the structured output requested.`;

async function generateTopics(
  ctx: AIContext,
  calendar: ContentCalendar,
  distribution: Array<{ pillarName: string; count: number }>,
): Promise<AITopicsOutput["topics"]> {
  const client = getOpenAIClient();
  const contextBlock = renderBrandContextBlock(ctx);
  const platforms = calendar.selected_platforms.join(", ");

  const campaignBlock = calendar.campaign_name
    ? `\n\nThis calendar runs alongside a campaign: "${calendar.campaign_name}"${calendar.campaign_objective ? `, objective: ${calendar.campaign_objective}` : ""}${calendar.campaign_message ? `. Key message: ${calendar.campaign_message}` : ""}. Weight topics toward supporting this campaign where relevant.`
    : "";

  const existingBlock =
    ctx.existing.ideaTitles.length > 0 || ctx.existing.recentPostTitles.length > 0
      ? `\n\nExisting content already planned (do not duplicate):\n${[...ctx.existing.ideaTitles, ...ctx.existing.recentPostTitles].slice(0, 80).map((t) => `- ${t}`).join("\n")}`
      : "";

  const allocationBlock = distribution
    .filter((d) => d.count > 0)
    .map((d) => `- ${d.pillarName}: ${d.count} topic(s)`)
    .join("\n");

  const totalCount = distribution.reduce((a, b) => a + b.count, 0);

  const completion = await client.chat.completions.parse({
    model: AI_MODEL_FAST,
    messages: [
      { role: "system", content: TOPICS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `${contextBlock}${campaignBlock}\n\nCalendar platforms: ${platforms}\nGenerate exactly ${totalCount} topics distributed as:\n${allocationBlock}${existingBlock}`,
      },
    ],
    response_format: zodResponseFormat(aiTopicsSchema, "calendar_topics"),
    temperature: 0.85,
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed || parsed.topics.length === 0) {
    throw new AIGenerationError("The AI couldn't generate calendar topics. Please try again.");
  }
  return parsed.topics;
}

// ---------------------------------------------------------------------------
// Stage 5 — duplicate protection
// ---------------------------------------------------------------------------

async function dedupeTopics(
  ctx: AIContext,
  topics: AITopicsOutput["topics"],
): Promise<AITopicsOutput["topics"]> {
  // Within-batch exact/near duplicate titles (case-insensitive, punctuation-insensitive).
  const seen = new Set<string>();
  const unique = topics.filter((t) => {
    const key = t.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const existingTitles = new Set(
    [...ctx.existing.ideaTitles, ...ctx.existing.recentPostTitles].map((t) => t.toLowerCase().trim()),
  );
  const flagged = unique.filter((t) => existingTitles.has(t.title.toLowerCase().trim()));

  if (flagged.length === 0) return unique;

  // Ask for fresh, distinct replacements for anything that collided with existing content.
  const client = getOpenAIClient();
  const contextBlock = renderBrandContextBlock(ctx);
  const avoid = [...existingTitles, ...unique.map((t) => t.title.toLowerCase())];

  const completion = await client.chat.completions.parse({
    model: AI_MODEL_FAST,
    messages: [
      { role: "system", content: TOPICS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `${contextBlock}\n\nGenerate ${flagged.length} replacement topics for the same pillar/platform/format pairs below, each with a genuinely different subject. Reuse the same references.\n\n${flagged
          .map((t) => `${t.reference}: pillar=${t.pillar_name}, platform=${t.platform}, format=${t.format}, objective=${t.objective}`)
          .join("\n")}\n\nAvoid any of these existing titles:\n${avoid.slice(0, 100).map((t) => `- ${t}`).join("\n")}`,
      },
    ],
    response_format: zodResponseFormat(aiTopicsSchema, "calendar_topics"),
    temperature: 0.9,
  });

  const replacements = completion.choices[0]?.message?.parsed?.topics ?? [];
  const byRef = new Map(replacements.map((r) => [r.reference, r]));

  return unique.map((t) => (existingTitles.has(t.title.toLowerCase().trim()) ? (byRef.get(t.reference) ?? t) : t));
}

// ---------------------------------------------------------------------------
// Stage 7 — detail generation
// ---------------------------------------------------------------------------

const DETAILS_SYSTEM_PROMPT = `You are Constory's content detail writer. For each topic given, write the full
content package: a brief explaining what the post should communicate and why, a hook (the opening line/visual
concept that stops the scroll), a full caption in the brand's voice, a call to action, 3-8 relevant hashtags
(without the # symbol), and a creative direction describing what the final visual asset should look like
(e.g. carousel structure, video concept, image concept, or slide sequence, as fits the format).

Rules:
- Match the brand's voice exactly as described.
- Write for the specific platform and format given for each topic.
- Every field must be genuinely written for that topic — never generic placeholder text.
- Return one entry per topic reference given, using the same reference.
- Respond only with the structured output requested.`;

async function generatePostDetails(
  ctx: AIContext,
  calendar: ContentCalendar,
  topics: Array<AITopicsOutput["topics"][number] & { scheduled_date: string }>,
): Promise<Map<string, AIBatchPostDetailsOutput["posts"][number]>> {
  const client = getOpenAIClient();
  const contextBlock = renderBrandContextBlock(ctx);
  const result = new Map<string, AIBatchPostDetailsOutput["posts"][number]>();

  const chunks: (typeof topics)[] = [];
  for (let i = 0; i < topics.length; i += DETAIL_BATCH_SIZE) {
    chunks.push(topics.slice(i, i + DETAIL_BATCH_SIZE));
  }

  // Chunks run with limited concurrency to keep this within a reasonable wall-clock time
  // without firing dozens of simultaneous requests at once.
  const CONCURRENCY = 3;
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((chunk) =>
        client.chat.completions.parse({
          model: AI_MODEL_FAST,
          messages: [
            { role: "system", content: DETAILS_SYSTEM_PROMPT },
            {
              role: "user",
              content: `${contextBlock}\n\nWrite full content details for these topics:\n${chunk
                .map((t) => `${t.reference}: "${t.title}" — platform=${t.platform}, format=${t.format}, objective=${t.objective}, pillar=${t.pillar_name}, scheduled=${t.scheduled_date}`)
                .join("\n")}`,
            },
          ],
          response_format: zodResponseFormat(aiBatchPostDetailsSchema, "post_details"),
          temperature: 0.7,
        }),
      ),
    );

    settled.forEach((res) => {
      if (res.status === "fulfilled") {
        const posts = res.value.choices[0]?.message?.parsed?.posts ?? [];
        posts.forEach((p) => result.set(p.reference, p));
      }
      // A failed chunk simply leaves those posts without generated detail — Stage 8 below
      // fills in a safe placeholder rather than dropping the post entirely, and the whole
      // calendar generation is not aborted for a partial failure.
    });
  }

  return result;
}
