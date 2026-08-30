import type { ContentIdea, IdeaStatus } from "@/types/database";

export interface IdeaFilters {
  search: string;
  status: IdeaStatus | "all";
  /** A pillar id, "all", or "none" (ideas with no pillar assigned). */
  pillar: string;
}

export function filterIdeas(ideas: ContentIdea[], filters: IdeaFilters): ContentIdea[] {
  const q = filters.search.trim().toLowerCase();
  return ideas.filter((idea) => {
    if (filters.status !== "all" && idea.status !== filters.status) return false;
    if (filters.pillar === "none" && idea.content_pillar_id) return false;
    if (filters.pillar !== "all" && filters.pillar !== "none" && idea.content_pillar_id !== filters.pillar) return false;
    if (q && !idea.title.toLowerCase().includes(q) && !idea.description.toLowerCase().includes(q)) return false;
    return true;
  });
}
