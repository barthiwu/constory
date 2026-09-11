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

export const INDUSTRY_OPTIONS = [
  "Interior Design & Home",
  "Fashion & Apparel",
  "Beauty & Cosmetics",
  "Health & Wellness",
  "Fitness & Sports",
  "Food & Beverage",
  "Restaurants & Hospitality",
  "Travel & Tourism",
  "Real Estate",
  "Construction & Architecture",
  "Retail & E-commerce",
  "Technology & SaaS",
  "Marketing & Advertising",
  "Consulting & Professional Services",
  "Finance & Insurance",
  "Education & Coaching",
  "Nonprofit & Community",
  "Entertainment & Media",
  "Automotive",
  "Legal Services",
  "Other",
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

// Each platform's own brand color, as a complete Tailwind background-color
// class (not a raw hex -- Tailwind's build-time scanner only picks up
// arbitrary-value classes that appear as literal, complete strings in
// source, so these must stay whole strings here rather than being
// constructed at runtime from a hex value). lucide-react no longer ships
// brand/logo icons, so this stands in for a real logo wherever a platform
// needs to be visually distinct at a glance (the calendar's colored initial
// badges, platform badges on the Calendars list page) -- single source of
// truth so every surface agrees on the same color per platform.
export const PLATFORM_BG_CLASS: Record<string, string> = {
  instagram: "bg-[#E1306C]",
  facebook: "bg-[#1877F2]",
  linkedin: "bg-[#0A66C2]",
  tiktok: "bg-constory-black",
  x: "bg-constory-black",
  other: "bg-text-muted",
};

/** Solid platform-color badge classes -- white text on that platform's brand color. */
export function platformBadgeClassName(value: string): string {
  return `${PLATFORM_BG_CLASS[value] ?? PLATFORM_BG_CLASS.other} text-white border-transparent`;
}
