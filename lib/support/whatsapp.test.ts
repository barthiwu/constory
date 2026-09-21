import { describe, it, expect } from "vitest";
import { buildWhatsAppLink } from "@/lib/support/whatsapp";

describe("buildWhatsAppLink", () => {
  it("strips non-digit characters from the number", () => {
    expect(buildWhatsAppLink("+234 801 234 5678")).toBe("https://wa.me/2348012345678");
  });

  it("returns a bare link with no text param when no prefill is given", () => {
    expect(buildWhatsAppLink("2348012345678")).toBe("https://wa.me/2348012345678");
  });

  it("URL-encodes the prefill text", () => {
    const link = buildWhatsAppLink("2348012345678", "Hi, I need help & fast!");
    expect(link).toBe("https://wa.me/2348012345678?text=Hi%2C%20I%20need%20help%20%26%20fast!");
  });
});
