import { z } from "zod";

export const calendarBasicsSchema = z
  .object({
    name: z.string().trim().min(1, "Calendar name is required").max(160),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    posting_frequency: z.coerce.number().int().min(1, "At least 1 post per week").max(21, "That's a lot — try 21 or fewer per week"),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: "End date must be on or after the start date",
    path: ["end_date"],
  });
export type CalendarBasicsInput = z.infer<typeof calendarBasicsSchema>;

export const calendarPlatformsSchema = z.object({
  selected_platforms: z.array(z.string()).min(1, "Select at least one platform"),
});

export const calendarGoalSchema = z.object({
  primary_goal: z.string().optional().or(z.literal("")),
});

export const calendarCampaignSchema = z.object({
  campaign_name: z.string().trim().max(160).optional().or(z.literal("")),
  campaign_objective: z.string().trim().max(500).optional().or(z.literal("")),
  campaign_start_date: z.string().optional().or(z.literal("")),
  campaign_end_date: z.string().optional().or(z.literal("")),
  campaign_message: z.string().trim().max(1000).optional().or(z.literal("")),
});
