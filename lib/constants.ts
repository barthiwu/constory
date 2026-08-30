export const GOAL_OPTIONS = [
  { value: "brand_awareness", label: "Brand awareness" },
  { value: "audience_growth", label: "Audience growth" },
  { value: "engagement", label: "Engagement" },
  { value: "lead_generation", label: "Lead generation" },
  { value: "sales", label: "Sales" },
  { value: "education", label: "Education" },
  { value: "community_building", label: "Community building" },
] as const;

export const VOICE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "bold", label: "Bold" },
  { value: "educational", label: "Educational" },
  { value: "conversational", label: "Conversational" },
  { value: "inspirational", label: "Inspirational" },
  { value: "playful", label: "Playful" },
  { value: "premium", label: "Premium" },
] as const;

export const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X" },
  { value: "other", label: "Other" },
] as const;

export const CONTENT_FORMAT_OPTIONS = [
  "Single image",
  "Carousel",
  "Short video / Reel",
  "Long-form video",
  "Story",
  "Text post",
  "Poll",
  "Live",
] as const;

export const POST_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "planned", label: "Planned" },
  { value: "completed", label: "Completed" },
] as const;

export function goalLabel(value: string | null | undefined): string {
  return GOAL_OPTIONS.find((g) => g.value === value)?.label ?? value ?? "";
}

export function voiceLabel(value: string): string {
  return VOICE_OPTIONS.find((v) => v.value === value)?.label ?? value;
}

export function platformLabel(value: string): string {
  return PLATFORM_OPTIONS.find((p) => p.value === value)?.label ?? value;
}
