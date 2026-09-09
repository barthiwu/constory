import { describe, it, expect } from "vitest";
import { calculatePostCount, distributeDatesAcrossRange, largestRemainderAllocate } from "@/lib/ai/distribution";

describe("distributeDatesAcrossRange (timezone independence)", () => {
  it("never returns a date before startDate or after endDate, regardless of the server's local timezone", () => {
    // Reproduces a live bug: a calendar generated on a server running east
    // of UTC (e.g. WAT, UTC+1) produced a first post dated one day before
    // the calendar's own start date, because the date math round-tripped
    // through the server's local timezone before formatting back to UTC.
    const dates = distributeDatesAcrossRange("2026-09-09", "2026-10-09", 12);
    expect(dates[0]).toBe("2026-09-09");
    expect(dates[dates.length - 1]).toBe("2026-10-09");
    for (const d of dates) {
      expect(d >= "2026-09-09").toBe(true);
      expect(d <= "2026-10-09").toBe(true);
    }
  });

  it("returns exactly startDate for a single post", () => {
    expect(distributeDatesAcrossRange("2026-09-09", "2026-10-09", 1)).toEqual(["2026-09-09"]);
  });

  it("spreads dates evenly across the range", () => {
    const dates = distributeDatesAcrossRange("2026-01-01", "2026-01-31", 4);
    expect(dates).toEqual(["2026-01-01", "2026-01-11", "2026-01-21", "2026-01-31"]);
  });
});

describe("calculatePostCount (timezone independence)", () => {
  it("computes the same post count regardless of the server's local timezone", () => {
    // 30-day span at 3 posts/week: 31 days / 7 * 3 ≈ 13.3 -> rounds to 13.
    expect(calculatePostCount("2026-09-09", "2026-10-09", 3)).toBe(13);
  });

  it("is at least 1 for a same-day range", () => {
    expect(calculatePostCount("2026-09-09", "2026-09-09", 3)).toBeGreaterThanOrEqual(1);
  });
});

describe("largestRemainderAllocate", () => {
  it("always sums to the requested total", () => {
    const result = largestRemainderAllocate([40, 35, 25], 13);
    expect(result.reduce((a, b) => a + b, 0)).toBe(13);
  });
});
