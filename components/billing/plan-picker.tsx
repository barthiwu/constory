"use client";

import { useState, useTransition } from "react";
import { Check, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMinorUnits } from "@/lib/billing/currency";
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
import type { PaymentMethod } from "@/lib/billing/provider";

const INTERVALS: BillingInterval[] = ["monthly", "quarterly", "annual"];

/** What each paid plan costs in the currency Paystack charges, per interval, in minor units. */
export type ChargeAmounts = Record<"creator" | "pro", Record<BillingInterval, number>>;

type PaidPlan = "creator" | "pro";
const INTERVAL_LENGTH: Record<BillingInterval, string> = { monthly: "1 month", quarterly: "3 months", annual: "12 months" };

export function PlanPicker({
  currentPlanId,
  currentInterval,
  providerName,
  chargeCurrency,
  chargeAmounts = null,
  isPrepaid = false,
  currentPeriodEnd = null,
}: {
  currentPlanId: PlanId;
  currentInterval: BillingInterval;
  providerName: BillingProviderName;
  /** Currency Paystack actually charges in — prices below are always shown in USD. */
  chargeCurrency: string;
  /** Naira (or whatever Paystack charges) price per paid plan and interval, in minor units. Null when charging in USD. */
  chargeAmounts?: ChargeAmounts | null;
  /** The current paid plan was bought by bank transfer: it doesn't renew by itself and is extended by paying again. */
  isPrepaid?: boolean;
  /** When the current period ends (shown on options that only open up after it). */
  currentPeriodEnd?: string | null;
}) {
  const { toast } = useToast();
  const [interval, setInterval] = useState<BillingInterval>(currentInterval === "monthly" ? "monthly" : currentInterval);
  const [transferFor, setTransferFor] = useState<PaidPlan | null>(null);
  const [pendingPlan, setPendingPlan] = useState<{ planId: PlanId; method: PaymentMethod } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Bank transfer is a Paystack channel for NGN payments (a one-off payment for the period bought; it can't renew itself).
  const bankTransferAvailable = providerName === "paystack" && chargeCurrency.toUpperCase() === "NGN";
  const endsOn = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "the current period ends";

  function amountFor(planId: PlanId, i: BillingInterval): number | null {
    if (!chargeAmounts || planId === "free") return null;
    return chargeAmounts[planId][i];
  }

  function handleSwitch(planId: PlanId, method: PaymentMethod = "card", quotedAmountMinor?: number) {
    setPendingPlan({ planId, method });
    startTransition(async () => {
      const result = await changePlanAction(planId, interval, method, quotedAmountMinor);
      if (result.error) {
        setPendingPlan(null);
        setTransferFor(null);
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
      toast({
        title: result.scheduled ? "Downgrade scheduled" : planId === "free" ? "Switched to Free" : `Switched to ${PLANS[planId].name}`,
        description: result.message,
        variant: "success",
      });
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
          // A prepaid account can't downgrade to another paid plan until its period ends, and "Free" already
          // happens on its own then. Everything else (renew, upgrade, switch interval) is open.
          const lockedUntilEnd = isPrepaid && planId !== currentPlanId && !isUpgrade(currentPlanId, planId);
          const isPaid = planId !== "free";
          const showTransfer = bankTransferAvailable && isPaid && !lockedUntilEnd && (isPrepaid ? true : planId !== currentPlanId && isUpgrade(currentPlanId, planId));
          const renewsByTransfer = isPrepaid && planId === currentPlanId;
          return (
            <div
              key={planId}
              className={cn(
                "grid gap-3 rounded-lg border bg-surface p-4",
                isCurrent ? "border-constory-blue" : "border-border",
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
                {amountFor(planId, interval) !== null && (
                  <p className="text-xs text-text-muted">
                    ≈ {formatMinorUnits(amountFor(planId, interval) as number, chargeCurrency)} {interval === "monthly" ? "per month" : interval === "quarterly" ? "every 3 months" : "per year"}
                  </p>
                )}
              </div>
              <p className="text-xs text-text-secondary">{plan.entitlements.aiCreditsPerMonth} AI credits / month</p>
              {lockedUntilEnd ? (
                <Button size="sm" variant="secondary" disabled>
                  {planId === "free" ? "Moves to Free when it ends" : `Available after ${endsOn}`}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={isCurrent && !isPrepaid ? "secondary" : "primary"}
                  disabled={isCurrent && !isPrepaid}
                  loading={isPending && pendingPlan?.planId === planId && pendingPlan.method === "card"}
                  onClick={() => handleSwitch(planId)}
                >
                  {isCurrent
                    ? isPrepaid
                      ? "Switch to card auto-renewal"
                      : "Current plan"
                    : isUpgrade(currentPlanId, planId) || currentPlanId === planId
                      ? `Upgrade to ${plan.name}${isPaid && bankTransferAvailable ? " (card)" : ""}`
                      : `Downgrade to ${plan.name}`}
                </Button>
              )}
              {showTransfer && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={isPending && pendingPlan?.planId === planId && pendingPlan.method === "bank_transfer"}
                  disabled={isPending}
                  onClick={() => setTransferFor(planId as PaidPlan)}
                >
                  <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
                  {renewsByTransfer ? "Renew by bank transfer" : "Pay by bank transfer"}
                </Button>
              )}
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
      {bankTransferAvailable && (
        <p className="text-xs text-text-muted">
          Bank transfer is a one-time payment for the period you choose: Paystack gives you a single-use account number, and your plan
          activates as soon as the transfer lands. It doesn&rsquo;t renew by itself, so renew it before it ends to keep your plan.
        </p>
      )}
      {providerName === "paystack" && chargeCurrency !== "USD" && (
        <p className="text-xs text-text-muted">
          Prices are shown in USD. Card payments are charged in {chargeCurrency} — the ≈ amounts are approximate and Paystack shows the final
          figure at checkout. A bank transfer is for the exact amount shown before you continue.
        </p>
      )}
      <Dialog open={transferFor !== null} onOpenChange={(open) => !open && !isPending && setTransferFor(null)}>
        <DialogContent>
          {transferFor && (() => {
            const amount = amountFor(transferFor, interval);
            const shown = amount !== null ? formatMinorUnits(amount, chargeCurrency) : null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Pay {PLANS[transferFor].name} by bank transfer</DialogTitle>
                  <DialogDescription>
                    {BILLING_INTERVAL_LABEL[interval]} · {INTERVAL_LENGTH[interval]} of {PLANS[transferFor].name}
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-lg border border-border bg-surface-secondary p-4 text-center">
                  <p className="text-xs text-text-secondary">You will transfer exactly</p>
                  <p className="text-3xl font-semibold text-text-primary">{shown}</p>
                </div>
                <ul className="grid gap-2 text-sm text-text-secondary">
                  <li>Paystack gives you a one-time account number for this payment, valid for a short time.</li>
                  <li>
                    Send exactly {shown}. A different amount — even a few naira short — won&rsquo;t activate your plan: Paystack rejects it and
                    refunds the money, usually within 24 hours.
                  </li>
                  <li>
                    Your plan activates as soon as the transfer is confirmed and runs for {INTERVAL_LENGTH[interval]}. It doesn&rsquo;t renew by
                    itself.
                  </li>
                </ul>
                <DialogFooter>
                  <Button variant="secondary" size="sm" onClick={() => setTransferFor(null)} disabled={isPending}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    loading={isPending && pendingPlan?.method === "bank_transfer"}
                    onClick={() => handleSwitch(transferFor, "bank_transfer", amount ?? undefined)}
                  >
                    Continue to Paystack
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
