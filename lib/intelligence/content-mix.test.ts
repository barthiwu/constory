import { describe, it, expect } from "vitest";
import { analyzeContentMix } from "@/lib/intelligence/content-mix";
import type { CalendarPost, ContentMixItem, ContentPillar } from "@/types/database";

function post(overrides: Partial<CalendarPost>): CalendarPost {
  return {
    id: "post-1",
    calendar_id: "cal-1",
    content_pillar_id: null,
    scheduled_date: "2026-08-30",
    platform: "instagram",
    title: "Untitled",
    format: null,
    objective: null,
    brief: null,
    hook: null,
    caption: null,
    cta: null,
    hashtags: [],
    creative_direction: null,
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function pillar(overrides: Partial<ContentPillar>): ContentPillar {
  return {
    id: "pillar-1",
    strategy_id: "strategy-1",
    workspace_id: "ws-1",
    name: "Education",
    description: "",
    recommended_percentage: 30,
    source: "AI",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const EDU = pillar({ id: "p-edu", name: "Education", recommended_percentage: 50 });
const PROMO = pillar({ id: "p-promo", name: "Promotional", recommended_percentage: 20 });
const MIX: ContentMixItem[] = [
  { pillar: "Education", percentage: 50 },
  { pillar: "Promotional", percentage: 20 },
];

describe("analyzeContentMix", () => {
  it("returns empty comparison/imbalances when there are no posts", () => {
    const result = analyzeContentMix(MIX, [], [EDU, PROMO]);
    expect(result).toEqual({ comparison: [], imbalances: [] });
  });

  it("returns empty comparison/imbalances when the strategy has no content mix", () => {
    const posts = [post({ id: "1", content_pillar_id: "p-edu" })];
    const result = analyzeContentMix([], posts, [EDU, PROMO]);
    expect(result).toEqual({ comparison: [], imbalances: [] });
  });

  it("returns empty comparison/imbalances when no posts have a pillar assigned", () => {
    const posts = [post({ id: "1", content_pillar_id: null })];
    const result = analyzeContentMix(MIX, posts, [EDU, PROMO]);
    expect(result).toEqual({ comparison: [], imbalances: [] });
  });

  it("computes actual percentages against posts that have a pillar, with no imbalance when actual matches strategy", () => {
    const evenMix: ContentMixItem[] = [
      { pillar: "Education", percentage: 50 },
      { pillar: "Promotional", percentage: 50 },
    ];
    const posts = [
      post({ id: "1", content_pillar_id: "p-edu" }),
      post({ id: "2", content_pillar_id: "p-edu" }),
      post({ id: "3", content_pillar_id: "p-promo" }),
      post({ id: "4", content_pillar_id: "p-promo" }),
    ];
    const result = analyzeContentMix(evenMix, posts, [EDU, PROMO]);
    const edu = result.comparison.find((c) => c.pillar === "Education")!;
    const promo = result.comparison.find((c) => c.pillar === "Promotional")!;
    expect(edu.actualPercentage).toBe(50);
    expect(promo.actualPercentage).toBe(50);
    expect(result.imbalances).toEqual([]);
  });

  it("flags a pillar significantly over-represented in the calendar", () => {
    const posts = [
      post({ id: "1", content_pillar_id: "p-edu" }),
      post({ id: "2", content_pillar_id: "p-edu" }),
      post({ id: "3", content_pillar_id: "p-edu" }),
      post({ id: "4", content_pillar_id: "p-edu" }),
    ];
    const result = analyzeContentMix(MIX, posts, [EDU, PROMO]);
    expect(result.imbalances).toContain(
      "Your calendar currently contains significantly more Education content than your strategy recommends.",
    );
  });

  it("flags a pillar the strategy cares about that is significantly under-represented", () => {
    const posts = [
      post({ id: "1", content_pillar_id: "p-promo" }),
      post({ id: "2", content_pillar_id: "p-promo" }),
      post({ id: "3", content_pillar_id: "p-promo" }),
      post({ id: "4", content_pillar_id: "p-promo" }),
    ];
    const result = analyzeContentMix(MIX, posts, [EDU, PROMO]);
    expect(result.imbalances).toContain(
      "Your calendar currently contains significantly less Education content than your strategy recommends.",
    );
  });

  it("does not flag under-use for a pillar the strategy recommends at a low percentage", () => {
    const lowMix: ContentMixItem[] = [{ pillar: "Niche", percentage: 5 }];
    const niche = pillar({ id: "p-niche", name: "Niche", recommended_percentage: 5 });
    const posts = [post({ id: "1", content_pillar_id: "p-edu" })];
    const result = analyzeContentMix(lowMix, posts, [EDU, niche]);
    expect(result.imbalances).toEqual([]);
  });

  it("ignores posts whose pillar id doesn't match a known pillar", () => {
    const posts = [post({ id: "1", content_pillar_id: "does-not-exist" })];
    const result = analyzeContentMix(MIX, posts, [EDU, PROMO]);
    expect(result.comparison.every((c) => c.actualPercentage === 0)).toBe(true);
  });
});
