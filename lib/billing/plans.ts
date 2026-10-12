// Single source of truth for Constory's plan definitions, prices, billing-
// interval discounts, and entitlement limits. Every part of the app —
// server actions, API routes, the pricing page, the billing page — imports
// from here rather than hard-coding a price or a limit. See spec §38.

export type PlanId = "free" | "creator" | "pro";
export type BillingInterval = "monthly" | "quarterly" | "annual";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "expired";

export interface PlanEntitlements {
  /** Max workspaces (brands) this account may own. null = unlimited. */
  brands: number | null;
  /** Max content_strategies rows per workspace. null = unlimited. */
  strategies: number | null;
  /** Max content_pillars rows per strategy. null = unlimited. */
  pillars: number | null;
  /** Max content_ideas rows per workspace. null = unlimited. */
  ideas: number | null;
  /** Max content_calendars rows per workspace. null = unlimited. */
  calendars: number | null;
  /** AI credits granted per monthly credit period. */
  aiCreditsPerMonth: number;
  /** "basic" (Free) vs "full" (Creator/Pro) product intelligence. */
  intelligence: "basic" | "full";
}

export interface PlanPricing {
  /** All prices in whole US cents to avoid float rounding issues. */
  monthlyCents: number;
  quarterlyCents: number;
  annualCents: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  pricing: PlanPricing;
  entitlements: PlanEntitlements;
  mostPopular?: boolean;
}

/** Discount applied to the monthly-equivalent price for each billing interval. Spec §3. */
export const BILLING_INTERVAL_DISCOUNT: Record<BillingInterval, number> = {
  monthly: 0,
  quarterly: 0.05,
  annual: 0.2,
};

export const BILLING_INTERVAL_MONTHS: Record<BillingInterval, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

export const BILLING_INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

/**
 * Free plan credits (10) are folded into every paid plan's total as a
 * baseline, per spec §2 — Creator shows 85 (75 paid + 10 base), Pro shows
 * 260 (250 paid + 10 base). Only the total is ever shown to the user.
 */
const BASE_CREDITS = 10;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try the full workflow, manually, forever.",
    pricing: { monthlyCents: 0, quarterlyCents: 0, annualCents: 0 },
    entitlements: {
      brands: 1,
      strategies: 1,
      pillars: 3,
      ideas: 25,
      calendars: 1,
      aiCreditsPerMonth: BASE_CREDITS,
      intelligence: "basic",
    },
  },
  creator: {
    id: "creator",
    name: "Creator",
    tagline: "For a single brand going all-in on content.",
    pricing: { monthlyCents: 1200, quarterlyCents: 3420, annualCents: 11520 },
    entitlements: {
      brands: 3,
      strategies: null,
      pillars: null,
      ideas: null,
      calendars: null,
      aiCreditsPerMonth: 75 + BASE_CREDITS,
      intelligence: "full",
    },
    mostPopular: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For agencies and multi-brand teams.",
    pricing: { monthlyCents: 2300, quarterlyCents: 6555, annualCents: 22080 },
    entitlements: {
      brands: 10,
      strategies: null,
      pillars: null,
      ideas: null,
      calendars: null,
      aiCreditsPerMonth: 250 + BASE_CREDITS,
      intelligence: "full",
    },
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "creator", "pro"];

export function getPlan(planId: PlanId): PlanDefinition {
  return PLANS[planId];
}

export function getPlanEntitlements(planId: PlanId): PlanEntitlements {
  return PLANS[planId].entitlements;
}

export function getPlanCreditAllowance(planId: PlanId): number {
  return PLANS[planId].entitlements.aiCreditsPerMonth;
}

/** Price for one billing cycle at the given interval, in whole cents. */
export function priceForInterval(planId: PlanId, interval: BillingInterval): number {
  const pricing = PLANS[planId].pricing;
  if (interval === "monthly") return pricing.monthlyCents;
  if (interval === "quarterly") return pricing.quarterlyCents;
  return pricing.annualCents;
}

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  // Whole-dollar prices render without decimals ($12, not $12.00); the two
  // discounted prices ($34.20, $65.55, ...) always carry exactly two.
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** True if `from` -> `to` is an upgrade in plan tier (used to decide upgrade vs. downgrade copy/flow). */
export function isUpgrade(from: PlanId, to: PlanId): boolean {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from);
}

/**
 * The end of the billing/credit period that starts at `from`, `interval` months later.
 *
 * Plain `setMonth(getMonth() + n)` overflows short months: Jan 31 + 1 month asks for "Feb 31", which
 * JS normalises to Mar 3 -- so an account activated on the 29th-31st got a period several days too
 * long (credits and access) and every later period drifted with it. This clamps to the last day of
 * the target month instead (Jan 31 -> Feb 28/29), and works in UTC so the result doesn't depend on
 * the server's timezone.
 */
export function nextPeriodEnd(interval: BillingInterval, from: Date = new Date()): Date {
  const months = BILLING_INTERVAL_MONTHS[interval];
  const d = new Date(from);
  const dayOfMonth = d.getUTCDate();
  d.setUTCDate(1); // avoid overflow while moving the month
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
  return d;
}
