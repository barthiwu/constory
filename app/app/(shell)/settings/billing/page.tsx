import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { BillingView } from "@/components/billing/billing-view";
import { getResolvedSubscription, getCreditBalance, listOwnedWorkspaces } from "@/services/billing-service";
import { getPlanEntitlements } from "@/lib/billing/plans";
import { getBillingProvider } from "@/lib/billing/provider";
import { verifyAndActivatePaymentReference } from "@/lib/billing/paystack-provider";

export const metadata: Metadata = { title: "Billing — Constory" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const { reference } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (reference) {
    // Server-authoritative "verify on return" from Paystack's hosted checkout
    // (spec v1.1 §17, §20) — the redirect itself proves nothing; only a
    // verified GET /transaction/verify call can activate a plan. Always
    // redirects afterward so a page refresh never re-submits the same
    // reference, and so the URL stays clean.
    let status = "error";
    try {
      const adminSupabase = createAdminClient();
      const result = await verifyAndActivatePaymentReference(adminSupabase, user.id, reference);
      status = result.status === "activated" || result.status === "already_processed" ? "success" : result.status;
    } catch {
      status = "error";
    }
    redirect(`/app/settings/billing?payment=${status}`);
  }

  const [subscription, creditBalance, workspaces] = await Promise.all([
    getResolvedSubscription(supabase, user.id),
    getCreditBalance(supabase, user.id),
    listOwnedWorkspaces(supabase, user.id),
  ]);

  const planId = subscription?.plan_id ?? "free";
  const brandLimit = getPlanEntitlements(planId).brands;
  const providerName = getBillingProvider().name;

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Manage your profile, workspace, and account." />
      <SettingsNav />
      <BillingView subscription={subscription} creditBalance={creditBalance} workspaces={workspaces} brandLimit={brandLimit} providerName={providerName} />
    </div>
  );
}
