import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CalendarPost, ContentCalendar, ContentPillar } from "@/types/database";
import { formatDate } from "@/lib/utils";
import { platformLabel } from "@/lib/constants";

/**
 * Builds a printable PDF of a calendar's posts: a title/date-range header
 * followed by one table row per post. Mirrors buildCalendarCSV in scope
 * (same fields, same sort order) but is meant for skimming/printing rather
 * than re-importing into a spreadsheet, so long free-text fields (brief,
 * caption, creative direction) are left out in favor of the columns an
 * editorial calendar review actually needs at a glance.
 */
export function buildCalendarPDF(calendar: ContentCalendar, posts: CalendarPost[], pillars: ContentPillar[]): jsPDF {
  const pillarById = new Map(pillars.map((p) => [p.id, p.name]));
  const sorted = [...posts].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(16);
  doc.text(calendar.name, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(100);
  const rangeLabel = `${formatDate(calendar.start_date)} – ${formatDate(calendar.end_date)} · ${posts.length} post${posts.length === 1 ? "" : "s"}`;
  doc.text(rangeLabel, 40, 58);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 74,
    head: [["Date", "Title", "Platform", "Pillar", "Format", "Status", "Hook"]],
    body: sorted.map((post) => [
      formatDate(post.scheduled_date),
      post.title,
      platformLabel(post.platform),
      post.content_pillar_id ? (pillarById.get(post.content_pillar_id) ?? "") : "",
      post.format ?? "",
      post.status,
      post.hook ?? "",
    ]),
    styles: { fontSize: 8, cellPadding: 6, overflow: "linebreak" },
    headStyles: { fillColor: [22, 139, 255] },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 160 },
      2: { cellWidth: 70 },
      3: { cellWidth: 130 },
      4: { cellWidth: 80 },
      5: { cellWidth: 60 },
      6: { cellWidth: "auto" },
    },
    margin: { left: 40, right: 40 },
  });

  return doc;
}

export function downloadCalendarPDF(filename: string, doc: jsPDF) {
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
