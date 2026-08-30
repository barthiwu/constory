import type { CalendarPost } from "@/types/database";

export interface CompletionInsights {
  planned: number;
  completed: number;
  draft: number;
  overdue: number;
  total: number;
}

/**
 * Rolls a set of posts up into simple completion counts. `today` is an
 * injected YYYY-MM-DD string rather than read from the clock in here, so
 * this stays pure and testable — callers (server components) compute it.
 */
export function getCompletionInsights(posts: CalendarPost[], today: string): CompletionInsights {
  let planned = 0;
  let completed = 0;
  let draft = 0;
  let overdue = 0;

  for (const post of posts) {
    if (post.status === "planned") planned++;
    else if (post.status === "completed") completed++;
    else if (post.status === "draft") draft++;

    if (post.scheduled_date < today && post.status !== "completed") overdue++;
  }

  return { planned, completed, draft, overdue, total: posts.length };
}
