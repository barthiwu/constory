import { describe, it, expect } from "vitest";
import { analyzePillarBalance } from "@/lib/intelligence/pillar-balance";
import type { CalendarPost, ContentPillar } from "@/types/database";

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

describe("analyzePillarBalance", () => {
  it("returns an empty list when there are no pillars", () => {
    expect(analyzePillarBalance([], [])).toEqual([]);
  });

  it("marks every pillar unused when there are no posts, without dividing by zero", () => {
    const pillars = [pillar({ id: "p1" }), pillar({ id: "p2", name: "Promo" })];
    const result = analyzePillarBalance(pillars, []);
    expect(result).toEqual([
      { pillarId: "p1", pillarName: "Education", postCount: 0, status: "unused" },
      { pillarId: "p2", pillarName: "Promo", postCount: 0, status: "unused" },
    ]);
  });

  it("marks a balanced pillar whose share roughly matches its recommendation", () => {
    const pillars = [pillar({ id: "p1", recommended_percentage: 50 }), pillar({ id: "p2", name: "Promo", recommended_percentage: 50 })];
    const posts = [
      post({ id: "1", content_pillar_id: "p1" }),
      post({ id: "2", content_pillar_id: "p2" }),
    ];
    const result = analyzePillarBalance(pillars, posts);
    expect(result.find((r) => r.pillarId === "p1")?.status).toBe("balanced");
    expect(result.find((r) => r.pillarId === "p2")?.status).toBe("balanced");
  });

  it("marks a pillar overused when its actual share exceeds recommendation by 15+ points", () => {
    const pillars = [pillar({ id: "p1", recommended_percentage: 20 }), pillar({ id: "p2", name: "Promo", recommended_percentage: 80 })];
    const posts = [
      post({ id: "1", content_pillar_id: "p1" }),
      post({ id: "2", content_pillar_id: "p1" }),
      post({ id: "3", content_pillar_id: "p1" }),
      post({ id: "4", content_pillar_id: "p2" }),
    ];
    const result = analyzePillarBalance(pillars, posts);
    expect(result.find((r) => r.pillarId === "p1")?.status).toBe("overused");
  });

  it("marks a pillar underused when its actual share falls short of recommendation by 15+ points", () => {
    const pillars = [pillar({ id: "p1", recommended_percentage: 80 }), pillar({ id: "p2", name: "Promo", recommended_percentage: 20 })];
    const posts = [
      post({ id: "1", content_pillar_id: "p1" }),
      post({ id: "2", content_pillar_id: "p2" }),
      post({ id: "3", content_pillar_id: "p2" }),
      post({ id: "4", content_pillar_id: "p2" }),
    ];
    const result = analyzePillarBalance(pillars, posts);
    expect(result.find((r) => r.pillarId === "p1")?.status).toBe("underused");
  });

  it("includes pillars with zero posts explicitly, alongside pillars that do have posts", () => {
    const pillars = [pillar({ id: "p1" }), pillar({ id: "p2", name: "Unused pillar" })];
    const posts = [post({ id: "1", content_pillar_id: "p1" })];
    const result = analyzePillarBalance(pillars, posts);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.pillarId === "p2")).toEqual({
      pillarId: "p2",
      pillarName: "Unused pillar",
      postCount: 0,
      status: "unused",
    });
  });

  it("ignores posts with no pillar assigned when computing shares", () => {
    const pillars = [pillar({ id: "p1", recommended_percentage: 100 })];
    const posts = [post({ id: "1", content_pillar_id: "p1" }), post({ id: "2", content_pillar_id: null })];
    const result = analyzePillarBalance(pillars, posts);
    expect(result[0].status).toBe("balanced");
  });
});
