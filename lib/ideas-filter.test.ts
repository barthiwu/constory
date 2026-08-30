import { describe, it, expect } from "vitest";
import { filterIdeas } from "@/lib/ideas-filter";
import type { ContentIdea } from "@/types/database";

function idea(overrides: Partial<ContentIdea>): ContentIdea {
  return {
    id: "id-1",
    workspace_id: "ws-1",
    content_pillar_id: null,
    title: "Untitled",
    description: "",
    source: "USER",
    status: "active",
    recommended_platform: null,
    recommended_format: null,
    content_objective: null,
    suggested_hook: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const IDEAS: ContentIdea[] = [
  idea({ id: "1", title: "Behind the scenes tour", description: "Show the workshop", content_pillar_id: "pillar-a", status: "active" }),
  idea({ id: "2", title: "Customer spotlight", description: "Feature a happy customer", content_pillar_id: "pillar-b", status: "used" }),
  idea({ id: "3", title: "Product launch teaser", description: "Tease the new drop", content_pillar_id: null, status: "archived" }),
  idea({ id: "4", title: "Weekly tip", description: "A quick educational tip", content_pillar_id: "pillar-a", status: "active" }),
];

describe("filterIdeas", () => {
  it("returns everything when no filters are active", () => {
    expect(filterIdeas(IDEAS, { search: "", status: "all", pillar: "all" })).toHaveLength(4);
  });

  it("filters by status", () => {
    const result = filterIdeas(IDEAS, { search: "", status: "active", pillar: "all" });
    expect(result.map((i) => i.id)).toEqual(["1", "4"]);
  });

  it("filters by a specific pillar", () => {
    const result = filterIdeas(IDEAS, { search: "", status: "all", pillar: "pillar-a" });
    expect(result.map((i) => i.id)).toEqual(["1", "4"]);
  });

  it("filters to ideas with no pillar via the 'none' sentinel", () => {
    const result = filterIdeas(IDEAS, { search: "", status: "all", pillar: "none" });
    expect(result.map((i) => i.id)).toEqual(["3"]);
  });

  it("searches by title, case-insensitively", () => {
    const result = filterIdeas(IDEAS, { search: "SPOTLIGHT", status: "all", pillar: "all" });
    expect(result.map((i) => i.id)).toEqual(["2"]);
  });

  it("searches by description as well as title", () => {
    const result = filterIdeas(IDEAS, { search: "workshop", status: "all", pillar: "all" });
    expect(result.map((i) => i.id)).toEqual(["1"]);
  });

  it("combines search, status, and pillar filters together", () => {
    const result = filterIdeas(IDEAS, { search: "tip", status: "active", pillar: "pillar-a" });
    expect(result.map((i) => i.id)).toEqual(["4"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterIdeas(IDEAS, { search: "nonexistent", status: "all", pillar: "all" })).toEqual([]);
  });
});
