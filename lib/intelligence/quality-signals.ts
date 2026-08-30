import type { CalendarPost } from "@/types/database";

/**
 * Plain, factual list of what's still missing from a post before it's ready
 * to publish — never a score, never an opinion. Returns [] when the post is
 * fully filled in.
 */
export function getPostQualitySignals(post: CalendarPost): string[] {
  const signals: string[] = [];

  if (!post.content_pillar_id) signals.push("No content pillar selected.");
  if (!post.hook || !post.hook.trim()) signals.push("No hook written yet.");
  if (!post.caption || !post.caption.trim()) signals.push("No caption written yet.");
  if (!post.cta || !post.cta.trim()) signals.push("No CTA detected.");
  if (post.hashtags.length === 0) signals.push("No hashtags added.");
  if (!post.creative_direction || !post.creative_direction.trim()) signals.push("No creative direction written yet.");

  return signals;
}
