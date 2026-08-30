import { describe, it, expect } from "vitest";
import { detectContentGaps } from "@/lib/intelligence/gap-detection";
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

describe("detectContentGaps", () => {
  it("returns nothing for an empty calendar beyond the no-upcoming-content warning", () => {
    const result = detectContentGaps([], TODAY);
    expect(result).toEqual([{ message: "You have no content scheduled after today.", severity: "warning" }]);
  });

  it("warns when there is no content scheduled after today but past posts exist", () => {
    const posts = [post({ id: "1", scheduled_date: "2026-08-01" })];
    const result = detectContentGaps(posts, TODAY);
    expect(result).toContainEqual({ message: "You have no content scheduled after today.", severity: "warning" });
  });

  it("does not warn about no upcoming content when something is scheduled today or later", () => {
    const posts = [post({ id: "1", scheduled_date: TODAY })];
    const result = detectContentGaps(posts, TODAY);
    expect(result.some((g) => g.message === "You have no content scheduled after today.")).toBe(false);
  });

  it("flags a 7+ day gap between two consecutive upcoming posts", () => {
    const posts = [
      post({ id: "1", scheduled_date: "2026-09-01" }),
      post({ id: "2", scheduled_date: "2026-09-10" }),
    ];
    const result = detectContentGaps(posts, TODAY);
    expect(result).toContainEqual({
      message: "No content scheduled for 9 days (between Sep 1, 2026 and Sep 10, 2026).",
      severity: "warning",
    });
  });

  it("does not flag a gap under 7 days", () => {
    const posts = [
      post({ id: "1", scheduled_date: "2026-09-01" }),
      post({ id: "2", scheduled_date: "2026-09-05" }),
    ];
    const result = detectContentGaps(posts, TODAY);
    expect(result.some((g) => g.message.startsWith("No content scheduled for"))).toBe(false);
  });

  it("flags format concentration when 80%+ of 5+ posts share a format", () => {
    const posts = [
      post({ id: "1", format: "reel", scheduled_date: "2026-09-01" }),
      post({ id: "2", format: "reel", scheduled_date: "2026-09-02" }),
      post({ id: "3", format: "reel", scheduled_date: "2026-09-03" }),
      post({ id: "4", format: "reel", scheduled_date: "2026-09-04" }),
      post({ id: "5", format: "carousel", scheduled_date: "2026-09-05" }),
    ];
    const result = detectContentGaps(posts, TODAY);
    expect(result).toContainEqual({
      message: "Your calendar is heavily concentrated on reel content.",
      severity: "info",
    });
  });

  it("does not flag concentration below the 5-post minimum even if all share a format", () => {
    const posts = [
      post({ id: "1", format: "reel", scheduled_date: "2026-09-01" }),
      post({ id: "2", format: "reel", scheduled_date: "2026-09-02" }),
    ];
    const result = detectContentGaps(posts, TODAY);
    expect(result.some((g) => g.message.includes("heavily concentrated"))).toBe(false);
  });

  it("does not flag concentration when formats are well distributed", () => {
    const posts = [
      post({ id: "1", format: "reel", scheduled_date: "2026-09-01" }),
      post({ id: "2", format: "carousel", scheduled_date: "2026-09-02" }),
      post({ id: "3", format: "story", scheduled_date: "2026-09-03" }),
      post({ id: "4", format: "static", scheduled_date: "2026-09-04" }),
      post({ id: "5", format: "reel", scheduled_date: "2026-09-05" }),
    ];
    const result = detectContentGaps(posts, TODAY);
    expect(result.some((g) => g.message.includes("heavily concentrated"))).toBe(false);
  });

  it("returns a clean, gap-free result for a healthy, evenly-spaced calendar", () => {
    const posts = [
      post({ id: "1", format: "reel", scheduled_date: "2026-09-01" }),
      post({ id: "2", format: "carousel", scheduled_date: "2026-09-03" }),
      post({ id: "3", format: "story", scheduled_date: "2026-09-05" }),
    ];
    const result = detectContentGaps(posts, TODAY);
    expect(result).toEqual([]);
  });
});
