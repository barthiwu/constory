"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  PLANS,
  PLAN_ORDER,
  BILLING_INTERVAL_LABEL,
  BILLING_INTERVAL_DISCOUNT,
  priceForInterval,
  formatCents,
  isUpgrade,
  type BillingInterval,
  type PlanId,
} from "@/lib/billing/plans";
import { changePlanAction } from "@/app/app/(shell)/settings/billing/actions";
import type { BillingProviderName } from "@/types/database";

const INTERVALS: BillingInterval[] = ["monthly", "quarterly", "annual"];

export function PlanPicker({
  currentPlanId,
  currentInterval,
  providerName,
}: {
  currentPlanId: PlanId;
  currentInterval: BillingInterval;
  providerName: BillingProviderName;
}) {
  const { toast } = useToast();
  const [interval, setInterval] = useState<BillingInterval>(currentInterval === "monthly" ? "monthly" : currentInterval);
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSwitch(planId: PlanId) {
    setPendingPlan(planId);
    startTransition(async () => {
      const result = await changePlanAction(planId, interval);
      if (result.error) {
        setPendingPlan(null);
        toast({ title: "Couldn't change plan", description: result.error, variant: "error" });
        return;
      }
      if (result.redirectUrl) {
        // Hand off to Paystack's hosted checkout — nothing is activated
        // until the payment is verified server-side on return (spec v1.1
        // §9, §17). Deliberately leaves pendingPlan set so the button stays
        // in its loading state through the navigation.
        window.location.href = result.redirectUrl;
        return;
      }
      setPendingPlan(null);
      toast({ title: planId === "free" ? "Switched to Free" : `Switched to ${PLANS[planId].name}`, description: result.message, variant: "success" });
    });
  }

  return (
    <div className="grid gap-6">
      <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
        {INTERVALS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setInterval(i)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              interval === i ? "bg-constory-blue text-white shadow-sm" : "text-text-secondary hover:text-text-primary",
            )}
            aria-pressed={interval === i}
          >
            {BILLING_INTERVAL_LABEL[i]}
            {BILLING_INTERVAL_DISCOUNT[i] > 0 && <span className={interval === i ? "text-white/80" : "text-success"}>-{Math.round(BILLING_INTERVAL_DISCOUNT[i] * 100)}%</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const isCurrent = planId === currentPlanId && interval === currentInterval;
          const cents = priceForInterval(planId, interval);
          return (
            <div
              key={planId}
              className={cn(
                "grid gap-3 rounded-lg border p-4",
                isCurrent ? "border-constory-blue bg-blue-light" : "border-border bg-surface",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">{plan.name}</span>
                {isCurrent && (
                  <Badge variant="blue">
                    <Check className="h-3 w-3" aria-hidden="true" /> Current
                  </Badge>
                )}
              </div>
              <div>
                <span className="text-xl font-semibold text-text-primary">{formatCents(cents)}</span>
                <span className="text-xs text-text-secondary">{cents === 0 ? " forever" : interval === "quarterly" ? " / 3mo" : interval === "annual" ? " / yr" : " / mo"}</span>
              </div>
              <p className="text-xs text-text-secondary">{plan.entitlements.aiCreditsPerMonth} AI credits / month</p>
              <Button
                size="sm"
                variant={isCurrent ? "secondary" : "primary"}
                disabled={isCurrent}
                loading={isPending && pendingPlan === planId}
                onClick={() => handleSwitch(planId)}
              >
                {isCurrent ? "Current plan" : isUpgrade(currentPlanId, planId) || currentPlanId === planId ? "Upgrade" : "Downgrade"} to {plan.name}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-text-muted">
        {providerName === "paystack"
          ? "Secure payments powered by Paystack. Switching to a paid plan takes you to Paystack's checkout; nothing changes until payment is verified."
          : "No payment provider is connected yet in this environment — plan changes take effect immediately without collecting payment."}{" "}
        See the AI Credits panel above for how credits are affected.
      </p>
    </div>
  );
}
