import { describe, it, expect } from "vitest";
import { aiIdeaSchema, aiIdeasSchema, aiTopicSchema } from "@/lib/ai/schemas";
import { CONTENT_FORMAT_OPTIONS } from "@/lib/constants";

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

  it("rejects a recommended_format that isn't one of the app's canonical format options", () => {
    // Regression: this field used to be free-text, so the AI could return a
    // value like "video" or "carousel post" that never matched any option in
    // the app's Format <Select> -- reproduced live, it left the Format field
    // rendering blank in both the idea-review screen and the saved idea's
    // edit dialog, despite the idea genuinely having a format saved.
    const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, recommended_format: "carousel post" });
    expect(result.success).toBe(false);
  });

  it("accepts every canonical CONTENT_FORMAT_OPTIONS value for recommended_format", () => {
    for (const format of CONTENT_FORMAT_OPTIONS) {
      const result = aiIdeaSchema.safeParse({ ...VALID_IDEA, recommended_format: format });
      expect(result.success).toBe(true);
    }
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


const VALID_TOPIC = {
  reference: "p1",
  title: "Behind the scenes of our morning prep",
  pillar_name: "Community",
  platform: "instagram",
  objective: "Engage",
  format: "Short video / Reel",
};

describe("aiTopicSchema", () => {
  it("accepts a fully populated, valid AI topic", () => {
    const result = aiTopicSchema.safeParse(VALID_TOPIC);
    expect(result.success).toBe(true);
  });

  it("rejects a format that isn't one of the app's canonical format options", () => {
    const result = aiTopicSchema.safeParse({ ...VALID_TOPIC, format: "video" });
    expect(result.success).toBe(false);
  });

  it("accepts every canonical CONTENT_FORMAT_OPTIONS value for format", () => {
    for (const format of CONTENT_FORMAT_OPTIONS) {
      const result = aiTopicSchema.safeParse({ ...VALID_TOPIC, format });
      expect(result.success).toBe(true);
    }
  });
});
