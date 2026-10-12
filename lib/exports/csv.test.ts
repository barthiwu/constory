import { describe, it, expect } from "vitest";
import Papa from "papaparse";
import { buildCalendarCSV, neutralizeFormula } from "@/lib/exports/csv";
import type { CalendarPost, ContentCalendar } from "@/types/database";

describe("neutralizeFormula", () => {
  it("prefixes cells a spreadsheet would execute", () => {
    for (const bad of ['=HYPERLINK("http://evil","x")', "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(neutralizeFormula(bad)).toBe(`'${bad}`);
    }
  });
  it("leaves ordinary text alone", () => {
    for (const ok of ["Launch day", "#marketing #tips", "Oct 12, 2026", "", "5 tips = great"]) {
      expect(neutralizeFormula(ok)).toBe(ok);
    }
  });
});

describe("buildCalendarCSV", () => {
  it("neutralizes formula payloads in every exported column", () => {
    const post = {
      id: "p1",
      scheduled_date: "2026-10-12",
      title: '=HYPERLINK("http://evil.example","click")',
      platform: "linkedin",
      content_pillar_id: null,
      objective: "+cmd",
      format: null,
      status: "planned",
      brief: "@brief",
      hook: "-hook",
      caption: "normal caption",
      cta: null,
      hashtags: ["tips"],
      creative_direction: null,
    } as unknown as CalendarPost;
    const csv = buildCalendarCSV({ id: "c1" } as ContentCalendar, [post], []);
    const [row] = Papa.parse<Record<string, string>>(csv, { header: true }).data;
    expect(row.Title.startsWith("'=")).toBe(true);
    expect(row.Objective).toBe("'+cmd");
    expect(row.Brief).toBe("'@brief");
    expect(row.Hook).toBe("'-hook");
    expect(row.Caption).toBe("normal caption");
    expect(row.Hashtags).toBe("#tips");
  });
});
