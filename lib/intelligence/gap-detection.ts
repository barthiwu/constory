import type { CalendarPost } from "@/types/database";
import { formatDate } from "@/lib/utils";

export interface ContentGap {
  message: string;
  severity: "info" | "warning";
}

const GAP_DAYS_THRESHOLD = 7;
const CONCENTRATION_MIN_POSTS = 5;
const CONCENTRATION_SHARE_THRESHOLD = 0.8;

/**
 * Factual, non-scored observations about scheduling gaps and format
 * concentration. `today` is an injected YYYY-MM-DD string — this never
 * touches the clock itself.
 */
export function detectContentGaps(posts: CalendarPost[], today: string): ContentGap[] {
  const gaps: ContentGap[] = [];

  const upcoming = posts
    .filter((p) => p.scheduled_date >= today)
    .slice()
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  if (upcoming.length === 0) {
    gaps.push({ message: "You have no content scheduled after today.", severity: "warning" });
  } else {
    for (let i = 0; i < upcoming.length - 1; i++) {
      const from = upcoming[i].scheduled_date;
      const to = upcoming[i + 1].scheduled_date;
      const days = daysBetween(from, to);
      if (days >= GAP_DAYS_THRESHOLD) {
        gaps.push({
          message: `No content scheduled for ${days} days (between ${formatDate(from)} and ${formatDate(to)}).`,
          severity: "warning",
        });
      }
    }
  }

  if (posts.length >= CONCENTRATION_MIN_POSTS) {
    const countByFormat = new Map<string, number>();
    for (const post of posts) {
      if (!post.format) continue;
      countByFormat.set(post.format, (countByFormat.get(post.format) ?? 0) + 1);
    }
    for (const [format, count] of countByFormat) {
      if (count / posts.length >= CONCENTRATION_SHARE_THRESHOLD) {
        gaps.push({ message: `Your calendar is heavily concentrated on ${format} content.`, severity: "info" });
        break;
      }
    }
  }

  return gaps;
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}
