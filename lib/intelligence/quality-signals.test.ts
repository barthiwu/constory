import { describe, it, expect } from "vitest";
import { getPostQualitySignals } from "@/lib/intelligence/quality-signals";
import type { CalendarPost } from "@/types/database";

function post(overrides: Partial<CalendarPost>): CalendarPost {
  return {
    id: "post-1",
    calendar_id: "cal-1",
    content_pillar_id: "pillar-1",
    scheduled_date: "2026-08-30",
    platform: "instagram",
    title: "Untitled",
    format: "reel",
    objective: null,
    brief: null,
    hook: "A strong hook",
    caption: "A full caption",
    cta: "Shop now",
    hashtags: ["#example"],
    creative_direction: "Bright, high-energy shots",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getPostQualitySignals", () => {
  it("returns an empty list when everything is filled in", () => {
    expect(getPostQualitySignals(post({}))).toEqual([]);
  });

  it("flags a missing content pillar", () => {
    expect(getPostQualitySignals(post({ content_pillar_id: null }))).toContain("No content pillar selected.");
  });

  it("flags a missing hook", () => {
    expect(getPostQualitySignals(post({ hook: null }))).toContain("No hook written yet.");
  });

  it("flags a whitespace-only hook the same as a missing one", () => {
    expect(getPostQualitySignals(post({ hook: "   " }))).toContain("No hook written yet.");
  });

  it("flags a missing caption", () => {
    expect(getPostQualitySignals(post({ caption: null }))).toContain("No caption written yet.");
  });

  it("flags a missing CTA", () => {
    expect(getPostQualitySignals(post({ cta: "" }))).toContain("No CTA detected.");
  });

  it("flags no hashtags", () => {
    expect(getPostQualitySignals(post({ hashtags: [] }))).toContain("No hashtags added.");
  });

  it("flags missing creative direction", () => {
    expect(getPostQualitySignals(post({ creative_direction: null }))).toContain("No creative direction written yet.");
  });

  it("returns every applicable signal for a fully empty post", () => {
    const result = getPostQualitySignals(
      post({
        content_pillar_id: null,
        hook: null,
        caption: null,
        cta: null,
        hashtags: [],
        creative_direction: null,
      }),
    );
    expect(result).toHaveLength(6);
  });
});
