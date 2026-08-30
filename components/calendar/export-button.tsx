"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCalendarCSV, downloadCSV } from "@/lib/exports/csv";
import { slugify } from "@/lib/utils";
import type { CalendarPost, ContentCalendar, ContentPillar } from "@/types/database";

export function ExportButton({ calendar, posts, pillars }: { calendar: ContentCalendar; posts: CalendarPost[]; pillars: ContentPillar[] }) {
  function handleExport() {
    const csv = buildCalendarCSV(calendar, posts, pillars);
    downloadCSV(`${slugify(calendar.name)}-content-plan`, csv);
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport} disabled={posts.length === 0}>
      <Download className="h-4 w-4" />
      Export
    </Button>
  );
}
