import { describe, it, expect } from "vitest";
import { getCompletionInsights } from "@/lib/intelligence/completion";
import type { CalendarPost } from "@/types/database";

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

const TODAY = "2026-08-30";

describe("getCompletionInsights", () => {
  it("returns all zeroes for an empty post list, never NaN", () => {
    const result = getCompletionInsights([], TODAY);
    expect(result).toEqual({ planned: 0, completed: 0, draft: 0, overdue: 0, total: 0 });
  });

  it("counts posts by status", () => {
    const posts = [
      post({ id: "1", status: "draft" }),
      post({ id: "2", status: "planned" }),
      post({ id: "3", status: "completed" }),
      post({ id: "4", status: "draft" }),
    ];
    const result = getCompletionInsights(posts, TODAY);
    expect(result).toEqual({ planned: 1, completed: 1, draft: 2, overdue: 0, total: 4 });
  });

  it("flags a past-dated, non-completed post as overdue", () => {
    const posts = [post({ id: "1", scheduled_date: "2026-08-01", status: "planned" })];
    const result = getCompletionInsights(posts, TODAY);
    expect(result.overdue).toBe(1);
  });

  it("does not flag a past-dated completed post as overdue", () => {
    const posts = [post({ id: "1", scheduled_date: "2026-08-01", status: "completed" })];
    const result = getCompletionInsights(posts, TODAY);
    expect(result.overdue).toBe(0);
  });

  it("does not flag a post scheduled for today as overdue", () => {
    const posts = [post({ id: "1", scheduled_date: TODAY, status: "draft" })];
    const result = getCompletionInsights(posts, TODAY);
    expect(result.overdue).toBe(0);
  });

  it("does not flag a future post as overdue", () => {
    const posts = [post({ id: "1", scheduled_date: "2026-09-15", status: "draft" })];
    const result = getCompletionInsights(posts, TODAY);
    expect(result.overdue).toBe(0);
  });

  it("counts multiple overdue posts across statuses", () => {
    const posts = [
      post({ id: "1", scheduled_date: "2026-08-01", status: "draft" }),
      post({ id: "2", scheduled_date: "2026-08-10", status: "planned" }),
      post({ id: "3", scheduled_date: "2026-08-10", status: "completed" }),
    ];
    const result = getCompletionInsights(posts, TODAY);
    expect(result.overdue).toBe(2);
    expect(result.total).toBe(3);
  });
});
