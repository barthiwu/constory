"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { buildCalendarCSV, downloadCSV } from "@/lib/exports/csv";
import { buildCalendarPDF, downloadCalendarPDF } from "@/lib/exports/pdf";
import { slugify } from "@/lib/utils";
import type { CalendarPost, ContentCalendar, ContentPillar } from "@/types/database";

export function ExportButton({ calendar, posts, pillars }: { calendar: ContentCalendar; posts: CalendarPost[]; pillars: ContentPillar[] }) {
  function handleExportCSV() {
    const csv = buildCalendarCSV(calendar, posts, pillars);
    downloadCSV(`${slugify(calendar.name)}-content-plan`, csv);
  }

  function handleExportPDF() {
    const doc = buildCalendarPDF(calendar, posts, pillars);
    downloadCalendarPDF(`${slugify(calendar.name)}-content-plan`, doc);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" disabled={posts.length === 0}>
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handleExportCSV}>
          <FileSpreadsheet className="h-4 w-4" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleExportPDF}>
          <FileText className="h-4 w-4" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
