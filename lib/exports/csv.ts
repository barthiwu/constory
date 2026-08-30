import Papa from "papaparse";
import type { CalendarPost, ContentCalendar, ContentPillar } from "@/types/database";
import { formatDate } from "@/lib/utils";
import { platformLabel } from "@/lib/constants";

/**
 * Builds a spreadsheet-compatible CSV of a calendar's posts. Every field the
 * spec lists for an individual post is included as its own column so the
 * export is usable directly in Excel/Google Sheets without follow-up cleanup.
 */
export function buildCalendarCSV(calendar: ContentCalendar, posts: CalendarPost[], pillars: ContentPillar[]): string {
  const pillarById = new Map(pillars.map((p) => [p.id, p.name]));
  const sorted = [...posts].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  const rows = sorted.map((post) => ({
    Date: formatDate(post.scheduled_date),
    Title: post.title,
    Platform: platformLabel(post.platform),
    Pillar: post.content_pillar_id ? (pillarById.get(post.content_pillar_id) ?? "") : "",
    Objective: post.objective ?? "",
    Format: post.format ?? "",
    Status: post.status,
    Brief: post.brief ?? "",
    Hook: post.hook ?? "",
    Caption: post.caption ?? "",
    CTA: post.cta ?? "",
    Hashtags: (post.hashtags ?? []).map((h) => `#${h}`).join(" "),
    "Creative direction": post.creative_direction ?? "",
  }));

  return Papa.unparse(rows, { header: true });
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
