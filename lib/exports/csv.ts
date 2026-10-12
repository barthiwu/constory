import Papa from "papaparse";
import type { CalendarPost, ContentCalendar, ContentPillar } from "@/types/database";
import { formatDate } from "@/lib/utils";
import { platformLabel } from "@/lib/constants";

/**
 * CSV/formula injection guard. Post titles, captions etc. are user- or AI-authored text; a cell that
 * starts with = + - @ (or a tab/CR) is evaluated as a formula by Excel/Sheets/LibreOffice when the
 * exported file is opened (e.g. `=HYPERLINK(...)` or `=cmd|...`), which an attacker can use against
 * a teammate who exports a shared calendar. Prefixing a single quote makes the spreadsheet treat the
 * cell as plain text. (OWASP "CSV Injection".)
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

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

  const safeRows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, neutralizeFormula(String(value))])));

  return Papa.unparse(safeRows, { header: true });
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
