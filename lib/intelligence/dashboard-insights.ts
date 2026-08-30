import type { CalendarPost, ContentIdea, ContentPillar, ContentStrategy } from "@/types/database";
import { formatDate } from "@/lib/utils";
import { detectContentGaps } from "@/lib/intelligence/gap-detection";
import { analyzeContentMix } from "@/lib/intelligence/content-mix";
import { analyzePillarBalance } from "@/lib/intelligence/pillar-balance";
import { getCompletionInsights } from "@/lib/intelligence/completion";

export interface DashboardInsight {
  message: string;
  severity: "info" | "warning";
}

const MAX_INSIGHTS = 5;
const DRAFT_NUDGE_THRESHOLD = 3;

/**
 * Aggregates the other intelligence modules into a short, priority-ordered
 * list for the dashboard. Everything here is derived — this module doesn't
 * reimplement any of the underlying analysis, it just combines, ranks and
 * caps it. `ideas` is accepted for a stable, spec-shaped call signature even
 * though the current rule set doesn't use it directly.
 */
export function getDashboardInsights(params: {
  posts: CalendarPost[];
  ideas: ContentIdea[];
  strategy: ContentStrategy | null;
  pillars: ContentPillar[];
  today: string;
}): DashboardInsight[] {
  const { posts, strategy, pillars, today } = params;

  const warnings: DashboardInsight[] = [];
  const infos: DashboardInsight[] = [];

  for (const gap of detectContentGaps(posts, today)) {
    (gap.severity === "warning" ? warnings : infos).push({ message: gap.message, severity: gap.severity });
  }

  if (strategy && strategy.content_mix.length > 0) {
    const { imbalances } = analyzeContentMix(strategy.content_mix, posts, pillars);
    for (const message of imbalances) {
      warnings.push({ message, severity: "warning" });
    }
  }

  if (posts.length > 0) {
    for (const balance of analyzePillarBalance(pillars, posts)) {
      if (balance.status === "unused") {
        infos.push({ message: `Your ${balance.pillarName} pillar has not been used yet.`, severity: "info" });
      }
    }
  }

  const completion = getCompletionInsights(posts, today);
  if (completion.draft >= DRAFT_NUDGE_THRESHOLD) {
    infos.push({ message: `You have ${completion.draft} unfinished drafts.`, severity: "info" });
  }

  const nextPost = posts
    .filter((p) => p.scheduled_date >= today)
    .slice()
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
  if (nextPost) {
    infos.push({
      message: `Your next post, "${nextPost.title}", is scheduled for ${formatDate(nextPost.scheduled_date)}.`,
      severity: "info",
    });
  }

  return [...warnings, ...infos].slice(0, MAX_INSIGHTS);
}
