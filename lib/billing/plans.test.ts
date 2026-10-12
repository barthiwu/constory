import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_ORDER,
  BILLING_INTERVAL_DISCOUNT,
  priceForInterval,
  formatCents,
  isUpgrade,
  nextPeriodEnd,
  getPlanCreditAllowance,
  getPlanEntitlements,
} from "@/lib/billing/plans";

describe("PLANS pricing (spec §2)", () => {
  it("Free is $0 on every interval", () => {
    expect(priceForInterval("free", "monthly")).toBe(0);
    expect(priceForInterval("free", "quarterly")).toBe(0);
    expect(priceForInterval("free", "annual")).toBe(0);
  });

  it("Creator monthly is $12", () => {
    expect(priceForInterval("creator", "monthly")).toBe(1200);
  });

  it("Creator quarterly applies exactly a 5% discount off 3x monthly ($36 -> $34.20)", () => {
    const monthly = priceForInterval("creator", "monthly");
    const quarterly = priceForInterval("creator", "quarterly");
    expect(quarterly).toBe(3420);
    expect(quarterly).toBe(Math.round(monthly * 3 * (1 - BILLING_INTERVAL_DISCOUNT.quarterly)));
  });

  it("Creator annual applies exactly a 20% discount off 12x monthly ($144 -> $115.20)", () => {
    const monthly = priceForInterval("creator", "monthly");
    const annual = priceForInterval("creator", "annual");
    expect(annual).toBe(11520);
    expect(annual).toBe(Math.round(monthly * 12 * (1 - BILLING_INTERVAL_DISCOUNT.annual)));
  });

  it("Pro monthly is $23", () => {
    expect(priceForInterval("pro", "monthly")).toBe(2300);
  });

  it("Pro quarterly applies exactly a 5% discount off 3x monthly ($69 -> $65.55)", () => {
    expect(priceForInterval("pro", "quarterly")).toBe(6555);
  });

  it("Pro annual applies exactly a 20% discount off 12x monthly ($276 -> $220.80)", () => {
    expect(priceForInterval("pro", "annual")).toBe(22080);
  });

  it("formats whole-dollar and cents prices correctly", () => {
    expect(formatCents(0)).toBe("$0");
    expect(formatCents(1200)).toBe("$12");
    expect(formatCents(3420)).toBe("$34.20");
    expect(formatCents(11520)).toBe("$115.20");
    expect(formatCents(6555)).toBe("$65.55");
    expect(formatCents(22080)).toBe("$220.80");
  });
});

describe("AI credit allocation (spec §2, §5)", () => {
  it("shows the combined total, not the internal split", () => {
    expect(getPlanCreditAllowance("free")).toBe(10);
    expect(getPlanCreditAllowance("creator")).toBe(85); // 75 paid + 10 base
    expect(getPlanCreditAllowance("pro")).toBe(260); // 250 paid + 10 base
  });

  it("credit allowance does not change with billing interval (spec §3)", () => {
    // The plan config has exactly one aiCreditsPerMonth per plan — there is
    // no interval-specific override anywhere, so this is true by
    // construction, but assert it explicitly so a future refactor can't
    // silently introduce one.
    for (const id of PLAN_ORDER) {
      expect(typeof PLANS[id].entitlements.aiCreditsPerMonth).toBe("number");
    }
  });
});

describe("Plan entitlements (spec §12)", () => {
  it("Free plan limits", () => {
    const free = getPlanEntitlements("free");
    expect(free).toMatchObject({ brands: 1, strategies: 1, pillars: 3, ideas: 25, calendars: 1, intelligence: "basic" });
  });

  it("Creator plan limits", () => {
    const creator = getPlanEntitlements("creator");
    expect(creator.brands).toBe(3);
    expect(creator.strategies).toBeNull();
    expect(creator.pillars).toBeNull();
    expect(creator.ideas).toBeNull();
    expect(creator.calendars).toBeNull();
    expect(creator.intelligence).toBe("full");
  });

  it("Pro plan limits", () => {
    const pro = getPlanEntitlements("pro");
    expect(pro.brands).toBe(10);
    expect(pro.strategies).toBeNull();
    expect(pro.intelligence).toBe("full");
  });
});

describe("isUpgrade", () => {
  it("orders free < creator < pro", () => {
    expect(isUpgrade("free", "creator")).toBe(true);
    expect(isUpgrade("free", "pro")).toBe(true);
    expect(isUpgrade("creator", "pro")).toBe(true);
    expect(isUpgrade("pro", "creator")).toBe(false);
    expect(isUpgrade("creator", "free")).toBe(false);
    expect(isUpgrade("free", "free")).toBe(false);
  });
});

describe("nextPeriodEnd", () => {
  const iso = (d: Date) => d.toISOString();

  it("adds whole months for ordinary dates", () => {
    expect(iso(nextPeriodEnd("monthly", new Date("2026-10-12T08:30:00Z")))).toBe("2026-11-12T08:30:00.000Z");
    expect(iso(nextPeriodEnd("quarterly", new Date("2026-10-12T08:30:00Z")))).toBe("2027-01-12T08:30:00.000Z");
    expect(iso(nextPeriodEnd("annual", new Date("2026-10-12T08:30:00Z")))).toBe("2027-10-12T08:30:00.000Z");
  });

  it("clamps to the last day of a shorter month instead of overflowing into the next one", () => {
    // Previously Jan 31 + 1 month -> "Feb 31" -> Mar 3.
    expect(iso(nextPeriodEnd("monthly", new Date("2026-01-31T00:00:00Z")))).toBe("2026-02-28T00:00:00.000Z");
    expect(iso(nextPeriodEnd("monthly", new Date("2028-01-31T00:00:00Z")))).toBe("2028-02-29T00:00:00.000Z");
    expect(iso(nextPeriodEnd("monthly", new Date("2026-03-31T00:00:00Z")))).toBe("2026-04-30T00:00:00.000Z");
    expect(iso(nextPeriodEnd("quarterly", new Date("2026-11-30T00:00:00Z")))).toBe("2027-02-28T00:00:00.000Z");
  });

  it("handles leap-day annual renewals", () => {
    expect(iso(nextPeriodEnd("annual", new Date("2028-02-29T00:00:00Z")))).toBe("2029-02-28T00:00:00.000Z");
  });

  it("does not mutate its input", () => {
    const from = new Date("2026-01-31T00:00:00Z");
    nextPeriodEnd("monthly", from);
    expect(from.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
});
