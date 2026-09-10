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
import { createAdminClient } from "@/lib/supabase/server";
import { createSubscription as createPaystackSubscription } from "@/lib/billing/paystack-client";
import { getPaystackPlanCode } from "@/lib/billing/paystack-plan-codes";

type DB = SupabaseClient<Database>;

export async function getSubscription(supabase: DB, ownerId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    // Explicit column list, not "*" — migration 0020 revoked SELECT on
    // provider_subscription_token/provider_authorization_code from
    // `authenticated` (those two are service_role-only), so select("*")
    // fails under PostgREST for a non-admin client. Callers that hold an
    // admin client and genuinely need those two fields (disabling/enabling
    // the live Paystack subscription) should use getSubscriptionAdmin
    // below instead.
    .select(
      "id, owner_id, plan_id, status, billing_interval, current_period_start, current_period_end, cancel_at_period_end, pending_plan_id, pending_billing_interval, provider, provider_customer_id, provider_subscription_id, created_at, updated_at"
    )
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data as Subscription | null;
}

/**
 * Admin-only counterpart to getSubscription — selects every column,
 * including provider_subscription_token/provider_authorization_code, which
 * are locked out of `authenticated`'s SELECT grant (migration 0020). Only
 * ever call this with the service-role admin client (never with a
 * user-scoped session client, which would get a PostgREST permission
 * error trying to select those two columns).
 */
export async function getSubscriptionAdmin(admin: DB, ownerId: string): Promise<Subscription | null> {
  const { data, error } = await admin.from("subscriptions").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  return data as Subscription | null;
}

/**
 * Reads the account's credit balance, lazily rolling an elapsed period over
 * to a fresh 0-used balance at the current plan's allocation first — via the
 * get_credit_balance() RPC (migration 0012) — so a page that only displays
 * the balance (Billing, Dashboard) never shows a stale, already-expired
 * period the way a raw table read would if no AI action had happened yet to
 * trigger consume_ai_credits()'s own rollover. See
 * PHASE7_5_AUDIT_REPORT.md Security Findings §3.
 */
export async function getCreditBalance(supabase: DB, ownerId: string): Promise<CreditBalance | null> {
  const { data, error } = await supabase.rpc("get_credit_balance", { p_owner_id: ownerId });
  if (error) throw error;
  return (data as CreditBalance | null) ?? null;
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
 * A subscription with a scheduled transition — either an explicit "Cancel
 * subscription" (`cancel_at_period_end`, which now always pairs with
 * `pending_plan_id = 'free'`) or a scheduled downgrade to a cheaper paid
 * plan (`pending_plan_id` alone) — has no background job to actually apply
 * that transition once the period ends in this environment, so every read
 * lazily applies it first, exactly like consume_ai_credits() lazily rolls
 * the credit period forward. `pending_plan_id` is the single source of
 * truth for what to resolve to; `cancel_at_period_end` is kept only as a
 * UI-facing "this was an explicit cancellation, not just a downgrade" flag
 * (see cancelSubscription/scheduleDowngrade/resumeSubscription below, which
 * always set both together).
 *
 * When the target is a *paid* plan on the Paystack provider (a downgrade to
 * a cheaper paid tier, not a cancellation to Free), this is also the moment
 * Paystack actually gets charged for the new plan — see the "real Paystack
 * charge" block below. That only happens here, lazily, on whichever request
 * first notices the period has ended, because this environment has no
 * background job/cron to trigger it exactly at the renewal instant; the
 * account's Paystack subscription for the OLD plan was already disabled
 * back when the downgrade was scheduled (see scheduleDowngrade in
 * lib/billing/paystack-provider.ts), so nothing double-charges in the
 * meantime — worst case, if nobody visits the app right after the period
 * ends, the new charge simply waits for the next visit rather than firing
 * early or not at all.
 *
 * This always returns the semantically-correct subscription even if the
 * persist below fails for some reason — a caller that is only a workspace
 * member (never the owner) can still read billing state (migration 0008's
 * RLS), and should see the resolved value on time either way; the DB row
 * itself simply catches up next time this resolves, for anyone.
 */
export async function getResolvedSubscription(supabase: DB, ownerId: string): Promise<Subscription | null> {
  const sub = await getSubscription(supabase, ownerId);
  if (!sub) return null;

  const periodEnded = new Date(sub.current_period_end).getTime() <= Date.now();
  if (!(periodEnded && sub.pending_plan_id)) return sub;

  const resolvedPlanId = sub.pending_plan_id;
  const resolvedInterval = sub.pending_billing_interval ?? "monthly";
  const periodStart = new Date();
  const periodEnd = nextPeriodEnd(resolvedInterval, periodStart);
  const admin = createAdminClient();

  // provider_authorization_code is locked out of `authenticated`'s SELECT
  // grant (migration 0020) — a raw Paystack authorization code should never
  // reach the client. `sub` above may have been fetched with the caller's
  // own session (getResolvedSubscription is called from page renders with
  // the user-scoped client), so it never has this field. Re-fetch it here
  // via the admin client, which isn't subject to that grant.
  let authorizationCode: string | null = null;
  if (resolvedPlanId !== "free" && sub.provider === "paystack" && sub.provider_customer_id) {
    const { data: authRow } = await admin
      .from("subscriptions")
      .select("provider_authorization_code")
      .eq("owner_id", ownerId)
      .maybeSingle();
    authorizationCode = authRow?.provider_authorization_code ?? null;
  }

  // Real-money branch: resolving to a still-paid plan on an account
  // Paystack actually owns. Guarded by a billing_events row keyed to this
  // exact (owner, old period_end) transition so a second concurrent/repeat
  // call — e.g. the billing page and the entitlements check both resolving
  // the same request — can never trigger a second Paystack charge for the
  // same renewal. Once this event id is recorded, this branch never runs
  // again for this transition: a failed charge marks the account past_due
  // and stops there rather than auto-retrying on every subsequent page
  // load (which would just keep re-declining and spamming Paystack) — the
  // customer/owner needs to take an action (fix the card, or the owner
  // resolves it manually) to move past a past_due state. That's a
  // deliberate V1 limit, not an oversight.
  if (resolvedPlanId !== "free" && sub.provider === "paystack" && sub.provider_customer_id && authorizationCode) {
    const resolveEventId = `resolve_scheduled_change:${ownerId}:${sub.current_period_end}`;
    const { alreadyProcessed } = await recordBillingEvent(admin, {
      provider: "paystack",
      providerEventId: resolveEventId,
      eventType: "scheduled_downgrade_resolution",
      ownerId,
      status: "processed",
    });

    if (alreadyProcessed) {
      // Someone already attempted this exact transition (this call, a
      // concurrent one, or an earlier visit) — never attempt a second
      // charge. Whatever it left behind (resolved, or past_due) is current.
      return getSubscription(supabase, ownerId);
    }

    try {
      const planCode = getPaystackPlanCode(resolvedPlanId, resolvedInterval);
      const created = await createPaystackSubscription({
        customerCode: sub.provider_customer_id,
        planCode,
        authorizationCode,
      });

      const resolved: Subscription = {
        ...sub,
        plan_id: resolvedPlanId,
        status: "active",
        billing_interval: resolvedInterval,
        cancel_at_period_end: false,
        pending_plan_id: null,
        pending_billing_interval: null,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        provider_subscription_id: created.subscription_code,
        provider_subscription_token: created.email_token,
      };

      await admin.rpc("resolve_scheduled_plan_change", {
        p_owner_id: ownerId,
        p_plan_id: resolvedPlanId,
        p_billing_interval: resolvedInterval,
        p_period_start: resolved.current_period_start,
        p_period_end: resolved.current_period_end,
        p_credit_allocation: getPlanCreditAllowance(resolvedPlanId),
        p_provider_subscription_id: created.subscription_code,
        p_provider_subscription_token: created.email_token,
      });

      return resolved;
    } catch (err) {
      await recordBillingEvent(admin, {
        provider: "paystack",
        providerEventId: `${resolveEventId}:error`,
        eventType: "scheduled_downgrade_resolution",
        ownerId,
        status: "error",
        detail: err instanceof Error ? err.message : "Unknown error charging the new plan.",
      }).catch(() => {});
      try {
        await admin.rpc("mark_subscription_past_due", { p_owner_id: ownerId });
      } catch {
        // Best-effort — the returned value below already reflects past_due either way.
      }
      return { ...sub, status: "past_due" };
    }
  }

  const resolved: Subscription = {
    ...sub,
    plan_id: resolvedPlanId,
    status: "active",
    billing_interval: resolvedInterval,
    cancel_at_period_end: false,
    pending_plan_id: null,
    pending_billing_interval: null,
    current_period_start: periodStart.toISOString(),
    current_period_end: periodEnd.toISOString(),
  };

  // Best-effort persist via the admin client — a regular authenticated
  // session can't write plan_id/pending_plan_id/etc at all (migration 0010's
  // column-level grant only allows self-service cancel_at_period_end), so
  // this must go through resolve_scheduled_plan_change() (migration 0020),
  // not a raw .update() with the caller's own session. Deliberately doesn't
  // touch provider/provider_customer_id — see that function's comment for
  // why apply_plan_change() can't be reused here.
  try {
    await admin.rpc("resolve_scheduled_plan_change", {
      p_owner_id: ownerId,
      p_plan_id: resolvedPlanId,
      p_billing_interval: resolvedInterval,
      p_period_start: resolved.current_period_start,
      p_period_end: resolved.current_period_end,
      p_credit_allocation: getPlanCreditAllowance(resolvedPlanId),
    });
  } catch {
    // Non-fatal — the resolved value above is still what's returned/used.
  }

  return resolved;
}

/**
 * Checks whether `credits` AI credits are available without spending them —
 * call this BEFORE invoking the AI provider (spec §33: never call the AI
 * provider when credits are insufficient). Also lazily rolls the credit
 * period over if it has elapsed, so the number shown is always current.
 *
 * `planId` is accepted for call-site convenience (callers already have it
 * resolved) but is no longer sent to the database — as of migration 0010,
 * consume_ai_credits() resolves the account's real plan allocation itself
 * from `subscriptions.plan_id`, closing the price-authority bypass found by
 * PHASE7_5_AUDIT_REPORT.md (a caller could previously claim any allocation).
 */
export async function checkAiCredits(supabase: DB, workspaceId: string, _planId: PlanId): Promise<ConsumeAiCreditsResult> {
  const { data, error } = await supabase.rpc("consume_ai_credits", {
    p_workspace_id: workspaceId,
    p_action_type: null,
    p_credits: 0,
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
 *
 * `planId` is accepted for call-site convenience but no longer sent to the
 * database — see the note on checkAiCredits above.
 */
export async function consumeAiCredits(
  supabase: DB,
  workspaceId: string,
  action: AIActionType,
  credits: number,
  _planId: PlanId,
): Promise<ConsumeAiCreditsResult> {
  const { data, error } = await supabase.rpc("consume_ai_credits", {
    p_workspace_id: workspaceId,
    p_action_type: action,
    p_credits: credits,
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
 *
 * MUST be called with the ADMIN client (createAdminClient()) — as of
 * migration 0010, apply_plan_change() is no longer callable by a regular
 * authenticated session at all (a direct PostgREST/RPC call previously let
 * any signed-in user grant themselves any plan for free; see
 * PHASE7_5_AUDIT_REPORT.md, Security Findings §1). `ownerId` must already be
 * server-verified (the caller's own authenticated session, or a value
 * already checked against it) before this is invoked — the function itself
 * no longer checks auth.uid(), since there is none under the service role.
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

/**
 * Cancels a paid subscription: stays active until the period ends, then
 * getResolvedSubscription lazily drops it to Free (spec §29). Sets
 * `pending_plan_id = 'free'` alongside `cancel_at_period_end` — Cancel is
 * now just the Free case of the same scheduled-transition mechanism
 * scheduleDowngrade() uses for a cheaper paid plan, so the two can never
 * disagree about where the account is headed. Goes through the admin
 * client + set_subscription_pending_change() (migration 0020): a regular
 * authenticated session can self-service-update `cancel_at_period_end`
 * alone (migration 0010's column grant), but not `pending_plan_id` — this
 * needs both set atomically, so both go through the RPC.
 *
 * Purely a local-state change — see lib/billing/paystack-provider.ts's
 * cancelSubscription for the real Paystack /subscription/disable call that
 * wraps this on a live Paystack account.
 */
export async function cancelSubscription(supabase: DB, ownerId: string): Promise<void> {
  void supabase; // kept for BillingProvider interface symmetry — see changePlan's identical note
  const { error } = await createAdminClient().rpc("set_subscription_pending_change", {
    p_owner_id: ownerId,
    p_cancel_at_period_end: true,
    p_pending_plan_id: "free",
    p_pending_billing_interval: null,
  });
  if (error) throw error;
}

/**
 * Schedules a downgrade to a cheaper *paid* plan (e.g. Pro -> Creator): the
 * account keeps its current plan's benefits until `current_period_end`,
 * then getResolvedSubscription lazily moves it to `planId`/`billingInterval`
 * — exactly like cancelSubscription, just landing somewhere other than
 * Free. This is what stops a downgrade from immediately charging a brand
 * new Paystack checkout for the lower plan with no credit for the paid
 * time already on the account.
 *
 * Purely a local-state change — see lib/billing/paystack-provider.ts's
 * scheduleDowngrade for the real Paystack /subscription/disable call that
 * wraps this on a live Paystack account.
 */
export async function scheduleDowngrade(ownerId: string, planId: PlanId, billingInterval: BillingInterval): Promise<void> {
  const { error } = await createAdminClient().rpc("set_subscription_pending_change", {
    p_owner_id: ownerId,
    p_cancel_at_period_end: false,
    p_pending_plan_id: planId,
    p_pending_billing_interval: billingInterval,
  });
  if (error) throw error;
}

/** Reverses a pending cancellation OR a pending downgrade before the period ends — "Keep my plan" is generic across both. */
export async function resumeSubscription(supabase: DB, ownerId: string): Promise<void> {
  void supabase;
  const { error } = await createAdminClient().rpc("set_subscription_pending_change", {
    p_owner_id: ownerId,
    p_cancel_at_period_end: false,
    p_pending_plan_id: null,
    p_pending_billing_interval: null,
  });
  if (error) throw error;
}

/**
 * Downgrade grace handling (spec §27-28): never deletes a workspace. Keeps
 * the oldest `limit` workspaces active and locks the rest (read-only, no new
 * content) — deterministic and simple for V1. `setActiveWorkspaces` lets the
 * owner pick a different set afterward, as long as the count fits the limit.
 *
 * MUST be called with the ADMIN client — as of migration 0010, regular
 * authenticated sessions no longer have UPDATE on `workspaces.billing_locked`
 * at all (previously any workspace editor could self-reverse a downgrade
 * lock directly via PostgREST; see PHASE7_5_AUDIT_REPORT.md, Security
 * Findings §1).
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
 * support) — as of the Paystack subscription-lifecycle fix, also the
 * `authorizationCode` (the reusable card token, needed to auto-bill a
 * scheduled downgrade at renewal — see getResolvedSubscription above) and
 * `subscriptionToken` (Paystack's `email_token`, needed to disable/enable
 * this subscription — see lib/billing/paystack-provider.ts). Both are
 * written with a plain admin-client `.update()`, not through a column-grant-
 * restricted RPC, because the service role bypasses those grants entirely —
 * see migration 0020's SELECT lockdown on these two columns for why they're
 * restricted from `authenticated` in the first place (they're payment-
 * capable secrets, not just IDs).
 */
export async function activatePaidPlanFromPayment(
  adminSupabase: DB,
  ownerId: string,
  planId: PlanId,
  billingInterval: BillingInterval,
  providerIds: { customerCode?: string | null; subscriptionCode?: string | null; subscriptionToken?: string | null; authorizationCode?: string | null },
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
    // A real, paid activation always supersedes anything previously
    // scheduled (e.g. the account had a pending downgrade queued up, then
    // turned around and upgraded again before it took effect).
    pending_plan_id: null,
    pending_billing_interval: null,
    provider: "paystack",
  };
  if (providerIds.customerCode) subscriptionUpdate.provider_customer_id = providerIds.customerCode;
  if (providerIds.subscriptionCode) subscriptionUpdate.provider_subscription_id = providerIds.subscriptionCode;
  if (providerIds.subscriptionToken) subscriptionUpdate.provider_subscription_token = providerIds.subscriptionToken;
  if (providerIds.authorizationCode) subscriptionUpdate.provider_authorization_code = providerIds.authorizationCode;

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
 * the race-free "insert or detect duplicate" pattern explicit. Reused
 * outside real webhook delivery too — see getResolvedSubscription above,
 * which keys an event id off (owner, period_end) to guard against a
 * duplicate Paystack charge for the same scheduled-downgrade transition.
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
 *
 * The `limit` check itself can run against the regular client (it's a
 * read), but the `billing_locked` writes below need the ADMIN client as of
 * migration 0010 — see the note on lockExcessWorkspaces above.
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
