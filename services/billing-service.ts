import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Subscription,
  CreditBalance,
  AiUsageLedgerRow,
  PlanId,
  BillingInterval,
  ConsumeAiCreditsResult,
} from "@/types/database";
import { getPlanCreditAllowance, getPlanEntitlements, nextPeriodEnd } from "@/lib/billing/plans";
import type { AIActionType } from "@/lib/billing/credit-costs";

type DB = SupabaseClient<Database>;

export async function getSubscription(supabase: DB, ownerId: string): Promise<Subscription | null> {
  const { data, error } = await supabase.from("subscriptions").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  return data as Subscription | null;
}

export async function getCreditBalance(supabase: DB, ownerId: string): Promise<CreditBalance | null> {
  const { data, error } = await supabase.from("credit_balances").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  return data as CreditBalance | null;
}

/** The owner (billing account) a workspace belongs to. */
export async function getWorkspaceOwnerId(supabase: DB, workspaceId: string): Promise<string | null> {
  const { data, error } = await supabase.from("workspaces").select("owner_id").eq("id", workspaceId).maybeSingle();
  if (error) throw error;
  return data?.owner_id ?? null;
}

export async function countOwnedWorkspaces(supabase: DB, ownerId: string): Promise<number> {
  const { count, error } = await supabase
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (error) throw error;
  return count ?? 0;
}

export async function listOwnedWorkspaces(
  supabase: DB,
  ownerId: string,
): Promise<Array<{ id: string; name: string; billing_locked: boolean; created_at: string }>> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, billing_locked, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * A cancelled-but-still-active subscription (`cancel_at_period_end`) has no
 * background job to flip it to Free once the period ends in this
 * environment — so every read lazily applies that transition first, exactly
 * like consume_ai_credits() lazily rolls the credit period forward. This
 * always returns the semantically-correct subscription even if the
 * best-effort write below is skipped (e.g. a non-owner workspace member is
 * only ever allowed to *read* billing state — see the RLS policies in
 * migration 0008 — so their read still reports "free" on time, the DB row
 * itself simply catches up whenever the owner is next resolved).
 */
export async function getResolvedSubscription(supabase: DB, ownerId: string): Promise<Subscription | null> {
  const sub = await getSubscription(supabase, ownerId);
  if (!sub) return null;

  const periodEnded = new Date(sub.current_period_end).getTime() <= Date.now();
  if (!(sub.cancel_at_period_end && periodEnded)) return sub;

  const resolved: Subscription = {
    ...sub,
    plan_id: "free",
    status: "active",
    billing_interval: "monthly",
    cancel_at_period_end: false,
    current_period_start: new Date().toISOString(),
    current_period_end: nextPeriodEnd("monthly").toISOString(),
  };

  // Best-effort persist. Blocked silently by RLS for a non-owner caller —
  // that's fine, the resolved value above is still what gets used/returned.
  await supabase
    .from("subscriptions")
    .update({
      plan_id: resolved.plan_id,
      status: resolved.status,
      billing_interval: resolved.billing_interval,
      cancel_at_period_end: resolved.cancel_at_period_end,
      current_period_start: resolved.current_period_start,
      current_period_end: resolved.current_period_end,
    })
    .eq("owner_id", ownerId)
    .then(
      () => {},
      () => {},
    );

  return resolved;
}

/**
 * Checks whether `credits` AI credits are available without spending them —
 * call this BEFORE invoking the AI provider (spec §33: never call the AI
 * provider when credits are insufficient). Also lazily rolls the credit
 * period over if it has elapsed, so the number shown is always current.
 */
export async function checkAiCredits(supabase: DB, workspaceId: string, planId: PlanId): Promise<ConsumeAiCreditsResult> {
  const { data, error } = await supabase.rpc("consume_ai_credits", {
    p_workspace_id: workspaceId,
    p_action_type: null,
    p_credits: 0,
    p_plan_allocation: getPlanCreditAllowance(planId),
  });
  if (error) throw error;
  const row = data?.[0];
  return row ?? { ok: false, remaining: 0, monthly_allocation: 0, reason: "unknown_error" };
}

/**
 * Atomically spends `credits` credits and records the usage ledger row. Only
 * ever call this AFTER a successful AI generation (spec §8) — never before,
 * and never on a failed generation. Concurrency-safe: see the SQL function's
 * comment in migration 0008 for how the row lock prevents overspend.
 */
export async function consumeAiCredits(
  supabase: DB,
  workspaceId: string,
  action: AIActionType,
  credits: number,
  planId: PlanId,
): Promise<ConsumeAiCreditsResult> {
  const { data, error } = await supabase.rpc("consume_ai_credits", {
    p_workspace_id: workspaceId,
    p_action_type: action,
    p_credits: credits,
    p_plan_allocation: getPlanCreditAllowance(planId),
  });
  if (error) throw error;
  const row = data?.[0];
  return row ?? { ok: false, remaining: 0, monthly_allocation: 0, reason: "unknown_error" };
}

export async function listRecentUsage(supabase: DB, ownerId: string, limit = 20): Promise<AiUsageLedgerRow[]> {
  const { data, error } = await supabase
    .from("ai_usage_ledger")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AiUsageLedgerRow[];
}

/**
 * Applies an upgrade/downgrade/interval change through the SECURITY DEFINER
 * apply_plan_change() function, which updates the subscription and resets
 * the credit period to the new plan's allowance in one atomic call. See
 * lib/billing/provider.ts for the caller-facing BillingProvider interface —
 * this is the low-level primitive it's built on.
 */
export async function applyPlanChange(
  supabase: DB,
  ownerId: string,
  planId: PlanId,
  billingInterval: BillingInterval,
): Promise<void> {
  const now = new Date();
  const periodEnd = nextPeriodEnd("monthly", now); // AI credit periods always run monthly regardless of billing interval (spec §3/§6).
  const { error } = await supabase.rpc("apply_plan_change", {
    p_owner_id: ownerId,
    p_plan_id: planId,
    p_status: "active",
    p_billing_interval: billingInterval,
    p_period_start: now.toISOString(),
    p_period_end: periodEnd.toISOString(),
    p_cancel_at_period_end: false,
    p_credit_allocation: getPlanCreditAllowance(planId),
  });
  if (error) throw error;
}

/** Cancels a paid subscription: stays active until the period ends, then getResolvedSubscription lazily drops it to Free (spec §29). */
export async function cancelSubscription(supabase: DB, ownerId: string): Promise<void> {
  const { error } = await supabase.from("subscriptions").update({ cancel_at_period_end: true }).eq("owner_id", ownerId);
  if (error) throw error;
}

/** Reverses a pending cancellation before the period ends. */
export async function resumeSubscription(supabase: DB, ownerId: string): Promise<void> {
  const { error } = await supabase.from("subscriptions").update({ cancel_at_period_end: false }).eq("owner_id", ownerId);
  if (error) throw error;
}

/**
 * Downgrade grace handling (spec §27-28): never deletes a workspace. Keeps
 * the oldest `limit` workspaces active and locks the rest (read-only, no new
 * content) — deterministic and simple for V1. `setActiveWorkspaces` lets the
 * owner pick a different set afterward, as long as the count fits the limit.
 */
export async function lockExcessWorkspaces(supabase: DB, ownerId: string, limit: number | null): Promise<void> {
  const workspaces = await listOwnedWorkspaces(supabase, ownerId);
  if (limit === null) {
    // Unlimited on the new plan — unlock everything.
    const lockedIds = workspaces.filter((w) => w.billing_locked).map((w) => w.id);
    if (lockedIds.length > 0) {
      const { error } = await supabase.from("workspaces").update({ billing_locked: false }).in("id", lockedIds);
      if (error) throw error;
    }
    return;
  }

  const toKeepActive = new Set(workspaces.slice(0, limit).map((w) => w.id));
  const toUnlock = workspaces.filter((w) => toKeepActive.has(w.id) && w.billing_locked).map((w) => w.id);
  const toLock = workspaces.filter((w) => !toKeepActive.has(w.id) && !w.billing_locked).map((w) => w.id);

  if (toUnlock.length > 0) {
    const { error } = await supabase.from("workspaces").update({ billing_locked: false }).in("id", toUnlock);
    if (error) throw error;
  }
  if (toLock.length > 0) {
    const { error } = await supabase.from("workspaces").update({ billing_locked: true }).in("id", toLock);
    if (error) throw error;
  }
}

// =============================================================================
// Paystack webhook / verified-payment activation
//
// Everything below is called with the ADMIN (service-role) client, never the
// regular RLS-scoped one — a Paystack webhook carries no Supabase user
// session at all, so there is no auth.uid() for is_billing_owner() (used by
// apply_plan_change()) to check. That RPC exists specifically to stop one
// authenticated USER from changing another user's plan; a verified Paystack
// event is a different trust boundary entirely — the caller (our own
// webhook route, having already checked the signature) is what's trusted
// here, not a Supabase session. See app/api/webhooks/paystack/route.ts.
// =============================================================================

/**
 * Activates a paid plan from a server-verified Paystack payment (webhook or
 * verify-on-return — spec §17 allows either as the authoritative source).
 * Same effect as applyPlanChange(): updates the subscription and resets the
 * credit period to the new plan's allowance in one go, plus records the
 * Paystack customer/subscription codes for future reference (cancellation,
 * support).
 */
export async function activatePaidPlanFromPayment(
  adminSupabase: DB,
  ownerId: string,
  planId: PlanId,
  billingInterval: BillingInterval,
  providerIds: { customerCode?: string | null; subscriptionCode?: string | null },
): Promise<void> {
  const now = new Date();
  const periodEnd = nextPeriodEnd("monthly", now);

  const subscriptionUpdate: Partial<Subscription> = {
    plan_id: planId,
    status: "active",
    billing_interval: billingInterval,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: false,
    provider: "paystack",
  };
  if (providerIds.customerCode) subscriptionUpdate.provider_customer_id = providerIds.customerCode;
  if (providerIds.subscriptionCode) subscriptionUpdate.provider_subscription_id = providerIds.subscriptionCode;

  const { error: subErr } = await adminSupabase.from("subscriptions").update(subscriptionUpdate).eq("owner_id", ownerId);
  if (subErr) throw subErr;

  const { error: balErr } = await adminSupabase
    .from("credit_balances")
    .update({
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
      monthly_allocation: getPlanCreditAllowance(planId),
      credits_used: 0,
    })
    .eq("owner_id", ownerId);
  if (balErr) throw balErr;

  await lockExcessWorkspaces(adminSupabase, ownerId, getPlanEntitlements(planId).brands);
}

/** Marks a subscription past_due from a failed-payment webhook. Never deletes data (spec §25). */
export async function markSubscriptionPastDue(adminSupabase: DB, ownerId: string): Promise<void> {
  const { error } = await adminSupabase.from("subscriptions").update({ status: "past_due" }).eq("owner_id", ownerId);
  if (error) throw error;
}

/** A Paystack-side subscription disable — mirror it locally rather than waiting for the period-end lazy transition. */
export async function markSubscriptionCancelledByProvider(adminSupabase: DB, ownerId: string): Promise<void> {
  const { error } = await adminSupabase.from("subscriptions").update({ status: "cancelled", cancel_at_period_end: true }).eq("owner_id", ownerId);
  if (error) throw error;
}

export interface RecordBillingEventInput {
  provider: "paystack";
  providerEventId: string;
  eventType: string;
  ownerId: string | null;
  status: "processed" | "ignored" | "error";
  detail?: string;
}

/**
 * Idempotency guard for webhook processing (spec §18-19): returns
 * `{ alreadyProcessed: true }` without doing anything if this exact provider
 * event was already recorded — the unique (provider, provider_event_id)
 * constraint in migration 0009 is the actual enforcement, this just makes
 * the race-free "insert or detect duplicate" pattern explicit.
 */
export async function recordBillingEvent(adminSupabase: DB, input: RecordBillingEventInput): Promise<{ alreadyProcessed: boolean }> {
  const { error } = await adminSupabase.from("billing_events").insert({
    provider: input.provider,
    provider_event_id: input.providerEventId,
    event_type: input.eventType,
    owner_id: input.ownerId,
    status: input.status,
    detail: input.detail,
  });
  if (error) {
    if (error.code === "23505") return { alreadyProcessed: true }; // unique_violation
    throw error;
  }
  return { alreadyProcessed: false };
}

/**
 * Lets the owner explicitly choose which workspaces stay active after a
 * downgrade, instead of accepting the deterministic oldest-first default —
 * spec §28's "select the 3 brands you want to keep active." Rejected if the
 * requested active set exceeds the current plan's brand limit.
 */
export async function setActiveWorkspaces(
  supabase: DB,
  ownerId: string,
  activeWorkspaceIds: string[],
  limit: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (limit !== null && activeWorkspaceIds.length > limit) {
    return { ok: false, error: `Your plan allows ${limit} active brand${limit === 1 ? "" : "s"}. You selected ${activeWorkspaceIds.length}.` };
  }
  const workspaces = await listOwnedWorkspaces(supabase, ownerId);
  const activeSet = new Set(activeWorkspaceIds);
  const toUnlock = workspaces.filter((w) => activeSet.has(w.id)).map((w) => w.id);
  const toLock = workspaces.filter((w) => !activeSet.has(w.id)).map((w) => w.id);

  if (toUnlock.length > 0) {
    const { error } = await supabase.from("workspaces").update({ billing_locked: false }).in("id", toUnlock);
    if (error) throw error;
  }
  if (toLock.length > 0) {
    const { error } = await supabase.from("workspaces").update({ billing_locked: true }).in("id", toLock);
    if (error) throw error;
  }
  return { ok: true };
}
