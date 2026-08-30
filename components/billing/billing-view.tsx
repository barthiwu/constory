"use client";

import { useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CreditMeter } from "@/components/billing/credit-meter";
import { PlanPicker } from "@/components/billing/plan-picker";
import { ManageActiveBrands } from "@/components/billing/manage-active-brands";
import { cancelSubscriptionAction, resumeSubscriptionAction } from "@/app/app/(shell)/settings/billing/actions";
import { PLANS, BILLING_INTERVAL_LABEL } from "@/lib/billing/plans";
import type { Subscription, CreditBalance, BillingProviderName } from "@/types/database";

const PAYMENT_RETURN_TOAST: Record<string, { title: string; description?: string; variant: "success" | "error" | "warning" }> = {
  success: { title: "Payment verified", description: "Your plan has been updated.", variant: "success" },
  not_successful: { title: "Payment not completed", description: "No changes were made to your plan.", variant: "warning" },
  owner_mismatch: { title: "Couldn't verify payment", description: "This payment reference doesn't match your account.", variant: "error" },
  incomplete_metadata: { title: "Payment verified, but incomplete", description: "Contact support — we couldn't tell which plan this was for.", variant: "warning" },
  error: { title: "Couldn't verify payment", description: "Please contact support if you were charged.", variant: "error" },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_BADGE: Record<Subscription["status"], { label: string; variant: "success" | "warning" | "danger" | "default" }> = {
  active: { label: "Active", variant: "success" },
  trialing: { label: "Trialing", variant: "success" },
  past_due: { label: "Past due", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "danger" },
  expired: { label: "Expired", variant: "danger" },
};

export function BillingView({
  subscription,
  creditBalance,
  workspaces,
  brandLimit,
  providerName,
}: {
  subscription: Subscription | null;
  creditBalance: CreditBalance | null;
  workspaces: Array<{ id: string; name: string; billing_locked: boolean; created_at: string }>;
  brandLimit: number | null;
  providerName: BillingProviderName;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Surface the outcome of a Paystack "verify on return" redirect (spec
  // v1.1 §17, §20) once, then strip it from the URL so a refresh doesn't
  // re-show it.
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (!payment) return;
    const entry = PAYMENT_RETURN_TOAST[payment] ?? PAYMENT_RETURN_TOAST.error;
    toast(entry);
    router.replace("/app/settings/billing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const planId = subscription?.plan_id ?? "free";
  const plan = PLANS[planId];
  const status = subscription ? STATUS_BADGE[subscription.status] : STATUS_BADGE.active;
  const isFree = planId === "free";

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelSubscriptionAction();
      if (result.error) return toast({ title: "Couldn't cancel", description: result.error, variant: "error" });
      toast({ title: "Subscription set to cancel", description: "You'll stay on your current plan until the end of this billing period, then move to Free.", variant: "success" });
    });
  }

  function handleResume() {
    startTransition(async () => {
      const result = await resumeSubscriptionAction();
      if (result.error) return toast({ title: "Couldn't resume", description: result.error, variant: "error" });
      toast({ title: "Cancellation reversed", variant: "success" });
    });
  }

  const showManageBrands = brandLimit !== null && (workspaces.length > brandLimit || workspaces.some((w) => w.billing_locked));

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Current plan</CardTitle>
            <CardDescription>Your workspace{brandLimit === 1 ? "" : "s"} run on this account&rsquo;s plan.</CardDescription>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <p className="text-text-muted">Plan</p>
              <p className="font-medium text-text-primary">{plan.name}</p>
            </div>
            {!isFree && subscription && (
              <>
                <div>
                  <p className="text-text-muted">Billing interval</p>
                  <p className="font-medium text-text-primary">{BILLING_INTERVAL_LABEL[subscription.billing_interval]}</p>
                </div>
                <div>
                  <p className="text-text-muted">Current period</p>
                  <p className="font-medium text-text-primary">
                    {formatDateTime(subscription.current_period_start)} – {formatDateTime(subscription.current_period_end)}
                  </p>
                </div>
              </>
            )}
          </div>

          {!isFree && subscription?.cancel_at_period_end && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning-light px-3 py-2 text-sm text-warning">
              <span>Your plan will move to Free on {formatDateTime(subscription.current_period_end)}.</span>
              <Button size="sm" variant="secondary" onClick={handleResume} loading={isPending}>
                Keep my plan
              </Button>
            </div>
          )}

          {!isFree && subscription && !subscription.cancel_at_period_end && (
            <Button size="sm" variant="destructive-ghost" onClick={handleCancel} loading={isPending} className="justify-self-start">
              Cancel subscription
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Credits</CardTitle>
          <CardDescription>Shared across every brand this account owns.</CardDescription>
        </CardHeader>
        <CardContent>
          {creditBalance ? (
            <CreditMeter used={creditBalance.credits_used} allocation={creditBalance.monthly_allocation} resetDate={creditBalance.period_end} />
          ) : (
            <p className="text-sm text-text-secondary">Credit balance unavailable.</p>
          )}
        </CardContent>
      </Card>

      {showManageBrands && brandLimit !== null && <ManageActiveBrands workspaces={workspaces} limit={brandLimit} />}

      <Card>
        <CardHeader>
          <CardTitle>Change plan</CardTitle>
          <CardDescription>Upgrade or downgrade at any time — your data is never deleted.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlanPicker currentPlanId={planId} currentInterval={subscription?.billing_interval ?? "monthly"} providerName={providerName} />
        </CardContent>
      </Card>
    </div>
  );
}
