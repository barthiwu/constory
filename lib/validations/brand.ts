import { z } from "zod";

export const workspaceBasicsSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(120),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^https?:\/\/.+\..+/i.test(v) || /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v), {
      message: "Enter a valid website (e.g. yourbrand.com)",
    }),
});
export type WorkspaceBasicsInput = z.infer<typeof workspaceBasicsSchema>;

export const businessDescriptionSchema = z.object({
  business_description: z.string().trim().min(10, "Tell us a bit more about your business (10+ characters)").max(4000),
});
export type BusinessDescriptionInput = z.infer<typeof businessDescriptionSchema>;

export const productServiceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  category: z.string().trim().max(120).optional().or(z.literal("")),
});
export type ProductServiceInput = z.infer<typeof productServiceSchema>;

export const audienceSchema = z.object({
  target_audience: z.string().trim().min(5, "Describe your target audience").max(2000),
  audience_type: z.string().trim().max(120).optional().or(z.literal("")),
  audience_age_range: z.string().trim().max(60).optional().or(z.literal("")),
  audience_locations: z.string().trim().max(300).optional().or(z.literal("")),
  audience_interests: z.string().trim().max(1000).optional().or(z.literal("")),
  audience_problems: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type AudienceInput = z.infer<typeof audienceSchema>;

export const goalsSchema = z.object({
  primary_goal: z.string().trim().min(1, "Choose a primary goal"),
  secondary_goals: z.array(z.string()).default([]),
});
export type GoalsInput = z.infer<typeof goalsSchema>;

const brandVoiceObjectSchema = z.object({
  brand_voice_traits: z.array(z.string()).max(8).default([]),
  brand_voice: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const brandVoiceSchema = brandVoiceObjectSchema.refine(
  (v) => v.brand_voice_traits.length > 0 || !!v.brand_voice?.trim(),
  { message: "Choose at least one voice trait or describe your brand voice", path: ["brand_voice"] },
);
export type BrandVoiceInput = z.infer<typeof brandVoiceSchema>;

export const platformsSchema = z.object({
  selected_platforms: z.array(z.string()).min(1, "Select at least one platform"),
});
export type PlatformsInput = z.infer<typeof platformsSchema>;

/** Full brand profile edit form on the Brand page (all sections at once). */
export const brandProfileSchema = businessDescriptionSchema
  .merge(audienceSchema)
  .merge(brandVoiceObjectSchema)
  .merge(goalsSchema)
  .merge(platformsSchema);
export type BrandProfileInput = z.infer<typeof brandProfileSchema>;
