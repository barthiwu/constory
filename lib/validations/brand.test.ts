import { describe, it, expect } from "vitest";
import { brandVoiceSchema } from "@/lib/validations/brand";

describe("brandVoiceSchema", () => {
  it("accepts a preset trait with no custom description", () => {
    const result = brandVoiceSchema.safeParse({ brand_voice_traits: ["professional"], brand_voice: "" });
    expect(result.success).toBe(true);
  });

  it("accepts a custom description with no preset traits", () => {
    const result = brandVoiceSchema.safeParse({ brand_voice_traits: [], brand_voice: "Clear, confident and approachable." });
    expect(result.success).toBe(true);
  });

  it("accepts both traits and a custom description together", () => {
    const result = brandVoiceSchema.safeParse({ brand_voice_traits: ["professional", "friendly"], brand_voice: "No corporate jargon." });
    expect(result.success).toBe(true);
  });

  it("rejects when both traits and description are empty", () => {
    const result = brandVoiceSchema.safeParse({ brand_voice_traits: [], brand_voice: "" });
    expect(result.success).toBe(false);
  });

  it("defaults brand_voice_traits to an empty array when omitted", () => {
    const result = brandVoiceSchema.safeParse({ brand_voice: "Warm and direct." });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.brand_voice_traits).toEqual([]);
  });
});
