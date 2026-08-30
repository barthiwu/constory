/**
 * Shared math for turning percentages into whole-number allocations that
 * always sum to an exact target. Used both when normalizing AI-suggested
 * pillar percentages to 100, and when converting those percentages into
 * actual post counts for a calendar (spec section 41, stage 3).
 *
 * Uses the largest-remainder method: take the floor of each share, then
 * hand out the leftover units to the entries with the largest fractional
 * remainder until the total matches exactly.
 */
export function largestRemainderAllocate(weights: number[], total: number): number[] {
  if (weights.length === 0) return [];
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  if (sumWeights <= 0) {
    // Even split when there's nothing to weight by.
    const base = Math.floor(total / weights.length);
    const result = weights.map(() => base);
    let remainder = total - base * weights.length;
    for (let i = 0; i < result.length && remainder > 0; i++, remainder--) result[i] += 1;
    return result;
  }

  const raw = weights.map((w) => (w / sumWeights) * total);
  const floors = raw.map(Math.floor);
  const allocated = floors.reduce((a, b) => a + b, 0);
  let remaining = total - allocated;

  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < order.length && remaining > 0; k++, remaining--) {
    result[order[k].i] += 1;
  }
  return result;
}

/** Normalizes a set of percentages (that should sum to ~100 but might not, due to AI rounding) to exactly 100. */
export function normalizeToHundred(percentages: number[]): number[] {
  return largestRemainderAllocate(percentages, 100);
}

/**
 * Number of posts for a calendar, from its actual date span and a target
 * posts-per-week frequency — accounts for the real length of the range
 * rather than assuming whole weeks.
 */
export function calculatePostCount(startDate: string, endDate: string, postsPerWeek: number): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const weeks = days / 7;
  return Math.max(1, Math.round(weeks * postsPerWeek));
}

/** Evenly spread `count` post dates across [startDate, endDate] (inclusive), respecting the range length. */
export function distributeDatesAcrossRange(startDate: string, endDate: string, count: number): string[] {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

  if (count <= 1) return [startDate];

  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.round((i / (count - 1)) * totalDays);
    const d = new Date(start.getTime() + offset * 86_400_000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
