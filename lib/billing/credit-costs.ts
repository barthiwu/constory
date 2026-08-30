// Centralized AI credit costs (spec §4.1). Every AI route imports its cost
// from here instead of hard-coding a number — this is the only place that
// changes if pricing for an action changes.

export type AIActionType =
  | "generate_post"
  | "regenerate_post"
  | "improve_content"
  | "generate_ideas"
  | "generate_strategy"
  | "generate_calendar";

export const AI_ACTION_COSTS: Record<AIActionType, number> = {
  generate_post: 1,
  regenerate_post: 1,
  improve_content: 1,
  generate_ideas: 2,
  generate_strategy: 4,
  generate_calendar: 4,
};

export function creditCost(action: AIActionType): number {
  return AI_ACTION_COSTS[action];
}
