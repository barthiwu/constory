// Client-safe progress-stage labels for the AI generation experience (spec
// section 28). Deliberately has no imports from the OpenAI SDK or anything
// server-only, so Client Components can import just the labels they need
// without pulling server code into the browser bundle.

export const STRATEGY_STAGES = ["Understanding your brand...", "Building your strategy..."];

export const IDEAS_STAGES = ["Understanding your brand...", "Finding content opportunities...", "Creating content ideas..."];

export const CALENDAR_STAGES = [
  "Understanding your brand...",
  "Balancing your content mix...",
  "Finding content opportunities...",
  "Organizing your calendar...",
  "Preparing your content plan...",
];

export const REGENERATION_STAGES = ["Regenerating..."];
