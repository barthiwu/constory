import { describe, it, expect } from "vitest";
import { getDashboardInsights } from "@/lib/intelligence/dashboard-insights";
import type { CalendarPost, ContentIdea, ContentPillar, ContentStrategy } from "@/types/database";

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

function strategy(overrides: Partial<ContentStrategy>): ContentStrategy {
  return {
    id: "strategy-1",
    workspace_id: "ws-1",
    strategy_summary: "Grow brand awareness.",
    monthly_theme: null,
    content_mix: [],
    source: "AI",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const IDEAS: ContentIdea[] = [];
const TODAY = "2026-08-30";

describe("getDashboardInsights", () => {
  it("never throws for a brand-new workspace with no data at all", () => {
    const result = getDashboardInsights({ posts: [], ideas: IDEAS, strategy: null, pillars: [], today: TODAY });
    // A workspace with zero posts still legitimately has "no content scheduled" —
    // the one thing that's explicitly suppressed for empty workspaces is the
    // unused-pillar callout (covered in the next test).
    expect(result).toEqual([{ message: "You have no content scheduled after today.", severity: "warning" }]);
  });

  it("returns an empty list when there is nothing to say (posts exist, all healthy, no strategy/pillars)", () => {
    const posts = [post({ id: "1", status: "completed", scheduled_date: "2026-09-01" })];
    const result = getDashboardInsights({ posts, ideas: IDEAS, strategy: null, pillars: [], today: TODAY });
    // Only the "next post" info line should show up here.
    expect(result).toEqual([
      { message: 'Your next post, "Untitled", is scheduled for Sep 1, 2026.', severity: "info" },
    ]);
  });

  it("does not nag about unused pillars when there are zero posts in the workspace", () => {
    const pillars = [pillar({ id: "p1" })];
    const result = getDashboardInsights({ posts: [], ideas: IDEAS, strategy: null, pillars, today: TODAY });
    expect(result.some((i) => i.message.includes("has not been used yet"))).toBe(false);
  });

  it("surfaces a warning when there is no upcoming content", () => {
    const posts = [post({ id: "1", scheduled_date: "2026-08-01" })];
    const result = getDashboardInsights({ posts, ideas: IDEAS, strategy: null, pillars: [], today: TODAY });
    expect(result[0]).toEqual({ message: "You have no content scheduled after today.", severity: "warning" });
  });

  it("surfaces a content-mix imbalance as a warning when a strategy exists", () => {
    const pillars = [
      pillar({ id: "p1", name: "Education", recommended_percentage: 20 }),
      pillar({ id: "p2", name: "Promotional", recommended_percentage: 20 }),
    ];
    const strat = strategy({
      content_mix: [
        { pillar: "Education", percentage: 20 },
        { pillar: "Promotional", percentage: 20 },
      ],
    });
    // 4 of 4 pillar-tagged posts are Education (100% actual vs 20% recommended) -> a clear over-use imbalance.
    const skewedPosts = [
      post({ id: "1", content_pillar_id: "p1", scheduled_date: "2026-09-01" }),
      post({ id: "2", content_pillar_id: "p1", scheduled_date: "2026-09-02" }),
      post({ id: "3", content_pillar_id: "p1", scheduled_date: "2026-09-03" }),
      post({ id: "4", content_pillar_id: "p1", scheduled_date: "2026-09-04" }),
    ];
    const result = getDashboardInsights({ posts: skewedPosts, ideas: IDEAS, strategy: strat, pillars, today: TODAY });
    expect(result).toContainEqual({
      message: "Your calendar currently contains significantly more Education content than your strategy recommends.",
      severity: "warning",
    });
  });

  it("ignores content-mix analysis entirely when the strategy has an empty content mix", () => {
    const strat = strategy({ content_mix: [] });
    const posts = [post({ id: "1", content_pillar_id: "p1", scheduled_date: "2026-09-01" })];
    const result = getDashboardInsights({ posts, ideas: IDEAS, strategy: strat, pillars: [pillar({ id: "p1" })], today: TODAY });
    expect(result.every((i) => !i.message.includes("strategy recommends"))).toBe(true);
  });

  it("flags an unused pillar as an info insight once the workspace has at least one post", () => {
    const pillars = [pillar({ id: "p1", name: "Education" }), pillar({ id: "p2", name: "Behind the Scenes" })];
    const posts = [post({ id: "1", content_pillar_id: "p1", scheduled_date: "2026-09-01" })];
    const result = getDashboardInsights({ posts, ideas: IDEAS, strategy: null, pillars, today: TODAY });
    expect(result).toContainEqual({ message: "Your Behind the Scenes pillar has not been used yet.", severity: "info" });
  });

  it("nudges about 3+ unfinished drafts", () => {
    const posts = [
      post({ id: "1", status: "draft", scheduled_date: "2026-09-01" }),
      post({ id: "2", status: "draft", scheduled_date: "2026-09-02" }),
      post({ id: "3", status: "draft", scheduled_date: "2026-09-03" }),
    ];
    const result = getDashboardInsights({ posts, ideas: IDEAS, strategy: null, pillars: [], today: TODAY });
    expect(result).toContainEqual({ message: "You have 3 unfinished drafts.", severity: "info" });
  });

  it("does not nudge about drafts below the threshold", () => {
    const posts = [
      post({ id: "1", status: "draft", scheduled_date: "2026-09-01" }),
      post({ id: "2", status: "draft", scheduled_date: "2026-09-02" }),
    ];
    const result = getDashboardInsights({ posts, ideas: IDEAS, strategy: null, pillars: [], today: TODAY });
    expect(result.some((i) => i.message.includes("unfinished drafts"))).toBe(false);
  });

  it("names the very next upcoming post", () => {
    const posts = [
      post({ id: "1", title: "Later post", scheduled_date: "2026-09-10" }),
      post({ id: "2", title: "Next post", scheduled_date: "2026-09-01" }),
    ];
    const result = getDashboardInsights({ posts, ideas: IDEAS, strategy: null, pillars: [], today: TODAY });
    expect(result).toContainEqual({
      message: 'Your next post, "Next post", is scheduled for Sep 1, 2026.',
      severity: "info",
    });
  });

  it("orders warnings before info and caps the result at 5 insights", () => {
    const pillars = [
      pillar({ id: "p1", name: "A" }),
      pillar({ id: "p2", name: "B" }),
      pillar({ id: "p3", name: "C" }),
      pillar({ id: "p4", name: "D" }),
    ];
    const posts = [
      post({ id: "1", content_pillar_id: "p1", status: "draft", scheduled_date: "2026-08-01" }),
      post({ id: "2", content_pillar_id: "p1", status: "draft", scheduled_date: "2026-08-02" }),
      post({ id: "3", content_pillar_id: "p1", status: "draft", scheduled_date: "2026-08-03" }),
    ];
    // No upcoming posts at all -> warning. Plus 3 unused pillars (B, C, D) as info, plus a draft nudge as info.
    const result = getDashboardInsights({ posts, ideas: IDEAS, strategy: null, pillars, today: TODAY });
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result[0].severity).toBe("warning");
    const firstInfoIndex = result.findIndex((i) => i.severity === "info");
    if (firstInfoIndex !== -1) {
      expect(result.slice(0, firstInfoIndex).every((i) => i.severity === "warning")).toBe(true);
    }
  });
});
