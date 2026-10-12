import { describe, it, expect, beforeEach } from "vitest";
import { usdCentsToTransferMinorUnits, formatMinorUnits } from "@/lib/billing/currency";

describe("usdCentsToTransferMinorUnits (whole naira, rounded up)", () => {
  beforeEach(() => {
    process.env.USD_TO_NGN_RATE = "1500";
  });

  it("is exact when the conversion is already whole naira", () => {
    expect(usdCentsToTransferMinorUnits(1200)).toBe(1_800_000); // $12 -> ₦18,000
  });

  it("rounds UP to the next whole naira so a person can type it", () => {
    process.env.USD_TO_NGN_RATE = "1493.7"; // $15 -> ₦22,405.5
    expect(usdCentsToTransferMinorUnits(1500)).toBe(2_240_600);
    process.env.USD_TO_NGN_RATE = "1493.6"; // $15 -> ₦22,404.0 exactly
    expect(usdCentsToTransferMinorUnits(1500)).toBe(2_240_400);
  });

  it("always returns a whole number of naira (multiple of 100 kobo)", () => {
    process.env.USD_TO_NGN_RATE = "1587.31";
    for (const cents of [1200, 2300, 3420, 6555, 25_000]) {
      expect(usdCentsToTransferMinorUnits(cents) % 100).toBe(0);
    }
  });
});

describe("formatMinorUnits", () => {
  it("formats naira without kobo", () => {
    expect(formatMinorUnits(2_240_500, "NGN")).toBe("₦22,405");
    expect(formatMinorUnits(1_800_000, "NGN")).toBe("₦18,000");
  });
  it("does not throw on an unknown currency code", () => {
    expect(formatMinorUnits(500_000, "XXZ")).toContain("5,000");
  });
});
