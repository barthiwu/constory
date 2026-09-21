import { AIGenerationError } from "@/lib/ai/client";

/**
 * Defense-in-depth against the "ground everything in the current date"
 * instruction in every SYSTEM_PROMPT (see renderBrandContextBlock's comment
 * in context.ts) being silently ignored — models don't follow every
 * instruction every time, and this app has already shipped a live instance
 * of that failure (an idea reading "2023 digital marketing trends" surfacing
 * as fresh content in 2026, caught only because a human happened to notice).
 *
 * This is a cheap textual safety net, not a fact-checker: it scans generated
 * text for any four-digit year outside {current year, next year} and treats
 * a match as a sign the model drifted into stale/training-data-era framing.
 * It will have false positives (a brand's own "since 2015" founding year, a
 * historical reference the copy genuinely needs) — that trade-off is
 * deliberate: a rare, retryable false-positive rejection is a much smaller
 * cost than silently shipping dated marketing copy to a client's real
 * audience. If false positives turn out to be common in practice, the fix is
 * a smarter check (e.g. only flag years appearing near "trend"/"this
 * year"-type language), not deleting this safety net.
 */
export function hasStaleYearReference(
  texts: Array<string | null | undefined>,
  referenceDate: Date = new Date(),
): boolean {
  const currentYear = referenceDate.getFullYear();
  const allowedYears = new Set([currentYear, currentYear + 1]);
  const yearPattern = /\b(19|20)\d{2}\b/g;

  for (const text of texts) {
    if (!text) continue;
    const matches = text.match(yearPattern);
    if (!matches) continue;
    for (const match of matches) {
      if (!allowedYears.has(Number(match))) return true;
    }
  }
  return false;
}

/**
 * Throws a retryable AIGenerationError if any text contains a stale year
 * reference (see hasStaleYearReference above). Use at the point a
 * generation function has its final parsed result in hand, before returning
 * it to the caller — this keeps stale content out of the database the same
 * way a Zod parse failure does, and (per the existing pattern in every
 * app/api/ai/* route) never causes credits to be consumed, since credit
 * consumption only happens after the generation call returns successfully.
 */
export function assertNoStaleYearReferences(
  texts: Array<string | null | undefined>,
  message = "The AI generated content referencing an out-of-date year. Please try again.",
  referenceDate: Date = new Date(),
): void {
  if (hasStaleYearReference(texts, referenceDate)) {
    throw new AIGenerationError(message, { retryable: true });
  }
}
