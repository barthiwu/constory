import type { CalendarPost, ContentPillar } from "@/types/database";

export interface PillarBalance {
  pillarId: string;
  pillarName: string;
  postCount: number;
  status: "unused" | "underused" | "balanced" | "overused";
}

const BALANCE_THRESHOLD = 15;

/**
 * For every pillar in the strategy, reports how many scheduled posts use it
 * and whether that share is roughly in line with the pillar's recommended
 * percentage. Pillars with zero posts are always "unused" — including them
 * (rather than dropping them) is the point: it's what surfaces a pillar
 * nobody has ever scheduled against.
 */
export function analyzePillarBalance(pillars: ContentPillar[], posts: CalendarPost[]): PillarBalance[] {
  const postsWithPillar = posts.filter((p) => p.content_pillar_id);
  const total = postsWithPillar.length;

  const countByPillarId = new Map<string, number>();
  for (const post of postsWithPillar) {
    const id = post.content_pillar_id as string;
    countByPillarId.set(id, (countByPillarId.get(id) ?? 0) + 1);
  }

  return pillars.map((pillar): PillarBalance => {
    const postCount = countByPillarId.get(pillar.id) ?? 0;

    if (postCount === 0) {
      return { pillarId: pillar.id, pillarName: pillar.name, postCount, status: "unused" };
    }

    const actualShare = total > 0 ? (postCount / total) * 100 : 0;
    const delta = actualShare - pillar.recommended_percentage;
    const status: PillarBalance["status"] = delta >= BALANCE_THRESHOLD ? "overused" : delta <= -BALANCE_THRESHOLD ? "underused" : "balanced";

    return { pillarId: pillar.id, pillarName: pillar.name, postCount, status };
  });
}
