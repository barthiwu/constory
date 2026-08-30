import { describe, it, expect } from "vitest";
import { aiIdeaSchema, aiIdeasSchema } from "@/lib/ai/schemas";

const VALID_IDEA = {
  title: "Behind the scenes of our morning prep",
  description: "Show the team setting up before opening — builds trust through transparency.",
  pillar_name: "Community",
  recommended_platform: "instagram",
  recommended_format: "Short video / Reel",
  content_objective: "Engage",
  suggested_hook: "You've never seen our kitchen like this...",
};

describe("aiIdeaSchema", () => {
  it("accepts a fully populated, valid AI idea", () => {
    const result = aiIdeaSchema.safeParse(VALID_IDEA);
    expect(result.success).toBe(true);
  });

  it("accepts an idea with every optional metadata field explicitly null", () => {
    const result = aiIdeaSchema.safeParse({
      ...VALID_IDEA,
      pillar_name: null,
      recommended_platform: null,
      recommended_format: null,
      content_objective: null,
      suggested_hook: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed metadata (wrong type for a nullable field)", () => {
    const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, recommended_platform: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects malformed metadata (an object where a string was expected)", () => {
    const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, suggested_hook: { text: "not a string" } });
    expect(result.success).toBe(false);
  });

  it("rejects a recommended_platform longer than the allowed length", () => {
    const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, recommended_platform: "x".repeat(41) });
    expect(result.success).toBe(false);
  });

  it("accepts a recommended_platform at the length boundary", () => {
    const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, recommended_platform: "x".repeat(40) });
    expect(result.success).toBe(true);
  });

  it("rejects a recommended_format longer than the allowed length", () => {
    const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, recommended_format: "x".repeat(81) });
    expect(result.success).toBe(false);
  });

  it("rejects a content_objective longer than the allowed length", () => {
    const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, content_objective: "x".repeat(121) });
    expect(result.success).toBe(false);
  });

  it("rejects a suggested_hook longer than the allowed length", () => {
    const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, suggested_hook: "x".repeat(301) });
    expect(result.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing (undefined) metadata field rather than silently defaulting it", () => {
    const withoutPlatform = Object.fromEntries(Object.entries(VALID_IDEA).filter(([key]) => key !== "recommended_platform"));
    const result = aiIdeaSchema.safeParse(withoutPlatform);
    // The AI response contract requires every field to be present (using
    // null for "no recommendation") — zodResponseFormat's structured
    // outputs mode relies on this, so an outright-missing key must fail
    // validation rather than silently becoming undefined.
    expect(result.success).toBe(false);
  });
});

describe("aiIdeasSchema", () => {
  it("accepts a batch of valid ideas", () => {
    const result = aiIdeasSchema.safeParse({ ideas: [VALID_IDEA, { ...VALID_IDEA, title: "A second idea" }] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty ideas array", () => {
    const result = aiIdeasSchema.safeParse({ ideas: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 ideas", () => {
    const result = aiIdeasSchema.safeParse({ ideas: Array.from({ length: 21 }, () => VALID_IDEA) });
    expect(result.success).toBe(false);
  });

  it("rejects the batch if any single idea is malformed", () => {
    const result = aiIdeasSchema.safeParse({ ideas: [VALID_IDEA, { ...VALID_IDEA, recommended_format: 7 }] });
    expect(result.success).toBe(false);
  });
});
