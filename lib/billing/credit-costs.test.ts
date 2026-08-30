import { describe, it, expect } from "vitest";
import { AI_ACTION_COSTS, creditCost } from "@/lib/billing/credit-costs";

describe("AI_ACTION_COSTS (spec §4.1)", () => {
  it("matches the spec's cost table exactly", () => {
    expect(AI_ACTION_COSTS).toEqual({
      generate_post: 1,
      regenerate_post: 1,
      improve_content: 1,
      generate_ideas: 2,
      generate_strategy: 4,
      generate_calendar: 4,
    });
  });

  it("creditCost reads from the single centralized table", () => {
    expect(creditCost("generate_strategy")).toBe(4);
    expect(creditCost("generate_calendar")).toBe(4);
    expect(creditCost("generate_ideas")).toBe(2);
    expect(creditCost("generate_post")).toBe(1);
    expect(creditCost("regenerate_post")).toBe(1);
    expect(creditCost("improve_content")).toBe(1);
  });
});
