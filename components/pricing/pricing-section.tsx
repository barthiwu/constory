"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PLANS,
  PLAN_ORDER,
  BILLING_INTERVAL_LABEL,
  BILLING_INTERVAL_DISCOUNT,
  priceForInterval,
  formatCents,
  type BillingInterval,
  type PlanId,
} from "@/lib/billing/plans";

const INTERVALS: BillingInterval[] = ["monthly", "quarterly", "annual"];

const FEATURE_LINES: Record<PlanId, string[]> = {
  free: ["1 brand", "1 active strategy", "Up to 3 content pillars", "Up to 25 saved ideas", "1 active calendar", "Basic product intelligence"],
  creator: ["3 brands", "Unlimited strategies & pillars", "Unlimited content ideas", "Unlimited calendars", "Full product intelligence", "Priority access to new features"],
  pro: ["10 brands", "Unlimited strategies & pillars", "Unlimited content ideas", "Unlimited calendars", "Full product intelligence", "Priority access to new features"],
};

const CTA_LABEL: Record<PlanId, string> = {
  free: "Get Started Free",
  creator: "Start Creator",
  pro: "Start Pro",
};

function priceBlock(planId: PlanId, interval: BillingInterval) {
  const cents = priceForInterval(planId, interval);
  if (cents === 0) {
    return (
      <div>
        <span className="text-4xl font-semibold tracking-tight text-text-primary">$0</span>
        <span className="ml-1 text-sm text-text-secondary">forever</span>
      </div>
    );
  }

  const suffix = interval === "monthly" ? "/month" : interval === "quarterly" ? " every 3 months" : "/year";
  const discount = BILLING_INTERVAL_DISCOUNT[interval];

  return (
    <div className="grid gap-1">
      <div>
        <span className="text-4xl font-semibold tracking-tight text-text-primary">{formatCents(cents)}</span>
        <span className="ml-1 text-sm text-text-secondary">{suffix}</span>
      </div>
      {discount > 0 && (
        <Badge variant="success" className="w-fit">
          Save {Math.round(discount * 100)}%
        </Badge>
      )}
    </div>
  );
}

export function PricingSection({ ctaHrefForPlan }: { ctaHrefForPlan: (planId: PlanId) => string }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <div className="grid gap-10">
      {/* Billing interval toggle (spec §14) */}
      <div className="mx-auto inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
        {INTERVALS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setInterval(i)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              interval === i ? "bg-constory-blue text-white shadow-sm" : "text-text-secondary hover:text-text-primary",
            )}
            aria-pressed={interval === i}
          >
            {BILLING_INTERVAL_LABEL[i]}
            {BILLING_INTERVAL_DISCOUNT[i] > 0 && (
              <span className={cn("text-xs", interval === i ? "text-white/80" : "text-success")}>
                Save {Math.round(BILLING_INTERVAL_DISCOUNT[i] * 100)}%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Plan cards (spec §15-18) */}
      <div className="mx-auto grid w-full max-w-5xl gap-6 sm:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          return (
            <div
              key={planId}
              className={cn(
                "relative flex flex-col gap-6 rounded-xl border bg-surface p-6",
                plan.mostPopular ? "border-constory-blue shadow-md sm:-translate-y-2" : "border-border",
              )}
            >
              {plan.mostPopular && (
                <Badge variant="blue" className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 px-3 py-1">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  MOST POPULAR
                </Badge>
              )}
              <div className="grid gap-1">
                <h3 className="text-lg font-semibold text-text-primary">{plan.name}</h3>
                <p className="text-sm text-text-secondary">{plan.tagline}</p>
              </div>

              {priceBlock(planId, interval)}

              <p className="text-sm font-medium text-text-primary">{plan.entitlements.aiCreditsPerMonth} AI Credits / Month</p>

              <ul className="grid flex-1 gap-2.5">
                {FEATURE_LINES[planId].map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-text-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-constory-blue" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <Button asChild variant={plan.mostPopular ? "primary" : "secondary"} size="lg">
                <Link href={ctaHrefForPlan(planId)}>{CTA_LABEL[planId]}</Link>
              </Button>
            </div>
          );
        })}
      </div>

      {/* Spec v1.1 §32: state the provider plainly, in USD only, without
          promising a specific payment method or auto-renewal guarantee for
          channels that don't support it. */}
      <p className="mx-auto max-w-lg text-center text-xs text-text-muted">
        Secure payments powered by Paystack. Prices are shown in USD. Available payment methods depend on your
        location and card issuer.
      </p>
    </div>
  );
}
