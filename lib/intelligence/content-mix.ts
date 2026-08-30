import type { CalendarPost, ContentMixItem, ContentPillar } from "@/types/database";

export interface MixComparison {
  pillar: string;
  strategyPercentage: number;
  actualPercentage: number;
  deltaPercentage: number;
}

const IMBALANCE_THRESHOLD = 20;
const MIN_STRATEGY_SHARE_TO_FLAG_UNDERUSE = 15;

/**
 * Compares the strategy's intended content mix (by pillar name) against what
 * has actually been scheduled across the calendar(s). Only posts assigned to
 * a pillar count toward "actual" — unassigned posts are excluded from the
 * denominator so they don't dilute every pillar's share.
 */
export function analyzeContentMix(
  contentMix: ContentMixItem[],
  posts: CalendarPost[],
  pillars: ContentPillar[],
): { comparison: MixComparison[]; imbalances: string[] } {
  const postsWithPillar = posts.filter((p) => p.content_pillar_id);
  const totalWithPillar = postsWithPillar.length;

  if (contentMix.length === 0 || totalWithPillar === 0) {
    return { comparison: [], imbalances: [] };
  }

  const pillarNameById = new Map(pillars.map((p) => [p.id, p.name]));
  const countByName = new Map<string, number>();
  for (const post of postsWithPillar) {
    const name = pillarNameById.get(post.content_pillar_id as string);
    if (!name) continue;
    countByName.set(name, (countByName.get(name) ?? 0) + 1);
  }

  const comparison: MixComparison[] = contentMix.map((mix) => {
    const count = countByName.get(mix.pillar) ?? 0;
    const actualPercentage = Math.round((count / totalWithPillar) * 100);
    return {
      pillar: mix.pillar,
      strategyPercentage: mix.percentage,
      actualPercentage,
      deltaPercentage: actualPercentage - mix.percentage,
    };
  });

  const imbalances: string[] = [];
  for (const c of comparison) {
    if (c.deltaPercentage >= IMBALANCE_THRESHOLD) {
      imbalances.push(
        `Your calendar currently contains significantly more ${c.pillar} content than your strategy recommends.`,
      );
    } else if (-c.deltaPercentage >= IMBALANCE_THRESHOLD && c.strategyPercentage >= MIN_STRATEGY_SHARE_TO_FLAG_UNDERUSE) {
      imbalances.push(
        `Your calendar currently contains significantly less ${c.pillar} content than your strategy recommends.`,
      );
    }
  }

  return { comparison, imbalances };
}
