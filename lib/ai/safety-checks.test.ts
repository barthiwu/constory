import { describe, it, expect } from "vitest";
import { hasStaleYearReference, assertNoStaleYearReferences } from "@/lib/ai/safety-checks";
import { AIGenerationError } from "@/lib/ai/client";

const REFERENCE_DATE = new Date("2026-09-21T00:00:00Z");

describe("hasStaleYearReference", () => {
  it("returns false for text with no year mentions", () => {
    expect(hasStaleYearReference(["A great post about our new product launch."], REFERENCE_DATE)).toBe(false);
  });

  it("returns false for the current year", () => {
    expect(hasStaleYearReference(["Our 2026 growth strategy"], REFERENCE_DATE)).toBe(false);
  });

  it("returns false for next year (forward-looking content is fine)", () => {
    expect(hasStaleYearReference(["Planning ahead for 2027"], REFERENCE_DATE)).toBe(false);
  });

  it("returns true for a stale past year", () => {
    expect(hasStaleYearReference(["2023 digital marketing trends"], REFERENCE_DATE)).toBe(true);
  });

  it("returns true if any one of several texts contains a stale year", () => {
    expect(hasStaleYearReference(["fine", null, "top tips for 2022", undefined], REFERENCE_DATE)).toBe(true);
  });

  it("ignores null/undefined entries", () => {
    expect(hasStaleYearReference([null, undefined, ""], REFERENCE_DATE)).toBe(false);
  });

  it("returns true for a year far in the future too", () => {
    expect(hasStaleYearReference(["Predictions for 2030"], REFERENCE_DATE)).toBe(true);
  });
});

describe("assertNoStaleYearReferences", () => {
  it("does not throw for clean text", () => {
    expect(() => assertNoStaleYearReferences(["Our 2026 launch plan"], undefined, REFERENCE_DATE)).not.toThrow();
  });

  it("throws a retryable AIGenerationError for stale text", () => {
    try {
      assertNoStaleYearReferences(["2019 was a great year"], undefined, REFERENCE_DATE);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIGenerationError);
      expect((err as AIGenerationError).retryable).toBe(true);
    }
  });

  it("uses the provided message", () => {
    try {
      assertNoStaleYearReferences(["2019 was a great year"], "custom message", REFERENCE_DATE);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as AIGenerationError).userMessage).toBe("custom message");
    }
  });
});
