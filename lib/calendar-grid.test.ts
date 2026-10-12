import { describe, it, expect } from "vitest";
import { getWeekDates, toISODate } from "@/lib/calendar-grid";

describe("toISODate", () => {
  it("formats the LOCAL calendar date, not the UTC one", () => {
    // Local midnight. `.toISOString().slice(0, 10)` returns the previous day for any timezone east of UTC
    // (e.g. Lagos), which made the week view's "next week" button stall.
    expect(toISODate(new Date(2026, 9, 18, 0, 0, 0))).toBe("2026-10-18");
    expect(toISODate(new Date(2026, 0, 1, 0, 30, 0))).toBe("2026-01-01");
    expect(toISODate(new Date(2026, 11, 31, 23, 59, 0))).toBe("2026-12-31");
  });
});

describe("week navigation (the week-view shiftWeek loop)", () => {
  function shiftWeek(anchor: string, delta: number): string {
    const d = new Date(`${anchor}T00:00:00`);
    d.setDate(d.getDate() + delta * 7);
    return toISODate(d);
  }

  it("advances exactly 7 days every click, so repeated 'next' keeps moving forward", () => {
    let anchor = "2026-10-12";
    const seenWeekStarts: string[] = [];
    for (let i = 0; i < 4; i++) {
      anchor = shiftWeek(anchor, 1);
      seenWeekStarts.push(getWeekDates(anchor)[0]);
    }
    expect(anchor).toBe("2026-11-09");
    expect(new Set(seenWeekStarts).size).toBe(4);
  });

  it("round-trips forward then back", () => {
    expect(shiftWeek(shiftWeek("2026-10-12", 1), -1)).toBe("2026-10-12");
  });
});
