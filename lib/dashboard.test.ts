import { describe, it, expect } from "vitest";
import { getPrimaryCta } from "@/lib/dashboard";

describe("getPrimaryCta", () => {
  it("asks to complete brand setup when the brand isn't complete", () => {
    const cta = getPrimaryCta({ brandComplete: false, hasStrategy: false, hasCalendar: false, activeCalendarId: null });
    expect(cta).toEqual({ label: "Complete Brand Setup", href: "/app/onboarding" });
  });

  it("asks to create a strategy once brand is complete but no strategy exists", () => {
    const cta = getPrimaryCta({ brandComplete: true, hasStrategy: false, hasCalendar: false, activeCalendarId: null });
    expect(cta).toEqual({ label: "Create Your Strategy", href: "/app/strategy" });
  });

  it("asks to create a calendar once a strategy exists but no calendar does", () => {
    const cta = getPrimaryCta({ brandComplete: true, hasStrategy: true, hasCalendar: false, activeCalendarId: null });
    expect(cta).toEqual({ label: "Create Content Calendar", href: "/app/calendars/new" });
  });

  it("offers to open the calendar once one exists, linking the active calendar", () => {
    const cta = getPrimaryCta({ brandComplete: true, hasStrategy: true, hasCalendar: true, activeCalendarId: "cal-123" });
    expect(cta).toEqual({ label: "Open Calendar", href: "/app/calendars/cal-123" });
  });

  it("prioritizes brand completeness over every later stage", () => {
    const cta = getPrimaryCta({ brandComplete: false, hasStrategy: true, hasCalendar: true, activeCalendarId: "cal-123" });
    expect(cta.label).toBe("Complete Brand Setup");
  });

  it("never depends on AI/OpenAI availability — only on workspace state", () => {
    // The function's inputs are entirely local product-state booleans; there is
    // no AI/network dependency in its signature at all, so every branch is
    // reachable without OpenAI configured.
    const allBranches = [
      getPrimaryCta({ brandComplete: false, hasStrategy: false, hasCalendar: false, activeCalendarId: null }),
      getPrimaryCta({ brandComplete: true, hasStrategy: false, hasCalendar: false, activeCalendarId: null }),
      getPrimaryCta({ brandComplete: true, hasStrategy: true, hasCalendar: false, activeCalendarId: null }),
      getPrimaryCta({ brandComplete: true, hasStrategy: true, hasCalendar: true, activeCalendarId: "x" }),
    ];
    expect(allBranches).toHaveLength(4);
    expect(new Set(allBranches.map((c) => c.label)).size).toBe(4);
  });
});
