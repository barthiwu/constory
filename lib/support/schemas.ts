import { z } from "zod";

// Structured output for the support chat AI (see app/api/support/chat/route.ts).
// needs_human separates "the FAQ covers this" from "a person needs to look at
// this" -- account-specific, billing-specific, or anything outside the FAQ
// content the model was given should set this true rather than guessing.
export const supportReplySchema = z.object({
  reply: z.string().min(1).max(1000),
  needs_human: z.boolean(),
});
export type SupportReplyOutput = z.infer<typeof supportReplySchema>;
