// The centralized entitlement layer (spec §11): every place in the app that
// needs to know "can this workspace do X" calls one of the functions below
// instead of sprinkling `if (plan === "pro")` checks around the codebase.
// All of these are server-only — they read from the database and must never
// be called from client code or trust a client-supplied plan/limit value.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PlanId } from "@/types/database";
import { getPlanEntitlements, type PlanEntitlements, PLANS, PLAN_ORDER } from "@/lib/billing/plans";
import { creditCost, type AIActionType } from "@/lib/billing/credit-costs";
import { getResolvedSubscription, getWorkspaceOwnerId, countOwnedWorkspaces, checkAiCredits } from "@/services/billing-service";

type DB = SupabaseClient<Database>;

export interface WorkspaceEntitlements {
  ownerId: string;
  planId: PlanId;
  limits: PlanEntitlements;
  /** This specific workspace was locked by a downgrade that no longer covers it (spec §27-28). */
  locked: boolean;
}

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
  /** The cheapest plan that would allow this action, for an upgrade CTA. */
  upgradeTo?: PlanId;
}

const ALLOWED: EntitlementResult = { allowed: true };

function cheapestPlanFor(limitKey: keyof PlanEntitlements, needed: number): PlanId | undefined {
  for (const id of PLAN_ORDER) {
    const limit = PLANS[id].entitlements[limitKey];
    if (limit === null || (typeof limit === "number" && limit >= needed)) return id;
  }
  return undefined;
}

export async function getWorkspaceEntitlements(supabase: DB, workspaceId: string): Promise<WorkspaceEntitlements | null> {
  const ownerId = await getWorkspaceOwnerId(supabase, workspaceId);
  if (!ownerId) return null;

  const [sub, { data: workspace }] = await Promise.all([
    getResolvedSubscription(supabase, ownerId),
    supabase.from("workspaces").select("billing_locked").eq("id", workspaceId).maybeSingle(),
  ]);
  const planId = sub?.plan_id ?? "free";

  return { ownerId, planId, limits: getPlanEntitlements(planId), locked: workspace?.billing_locked ?? false };
}

function lockedResult(): EntitlementResult {
  return {
    allowed: false,
    reason: "This brand is locked because your plan doesn't currently cover it. Manage your active brands from Settings → Billing.",
  };
}

/** Can this account create one more brand (workspace)? Scoped to the OWNER, not a single workspace — see migration 0008's architecture note. */
export async function canCreateBrand(supabase: DB, ownerId: string): Promise<EntitlementResult> {
  const sub = await getResolvedSubscription(supabase, ownerId);
  const planId = sub?.plan_id ?? "free";
  const limit = getPlanEntitlements(planId).brands;
  if (limit === null) return ALLOWED;

  const count = await countOwnedWorkspaces(supabase, ownerId);
  if (count < limit) return ALLOWED;
  return {
    allowed: false,
    reason: `Your ${PLANS[planId].name} plan includes ${limit} brand${limit === 1 ? "" : "s"}. Upgrade to add another.`,
    upgradeTo: cheapestPlanFor("brands", count + 1),
  };
}

/**
 * "Active strategies: 1" (Free) vs. unlimited (Creator/Pro) is a defined
 * entitlement (spec §12) but is deliberately NOT enforced as a raw row-count
 * cap here: services/strategy-service.ts's saveStrategy() never updates a
 * strategy in place — every save (including a routine AI regeneration or a
 * manual edit) inserts a brand-new content_strategies row on purpose, to
 * keep a workspace's strategy history (see that file's comment). Counting
 * rows against the limit would therefore block a Free workspace from ever
 * regenerating or re-saving its one strategy past the first time — a real
 * product regression, not the intended "one strategy" restriction. The
 * product's UI already only ever surfaces one current strategy per
 * workspace (getStrategy() always returns the latest row), so the practical
 * effect of the entitlement is already satisfied by the existing design;
 * this function is kept (rather than removed) as the single place that
 * documents and would implement real enforcement if content_strategies ever
 * gains an `is_current` flag or switches to update-in-place. Locked
 * workspaces still block, since that's data-safety, not a strategy count.
 */
export async function canCreateStrategy(supabase: DB, workspaceId: string): Promise<EntitlementResult> {
  const ent = await getWorkspaceEntitlements(supabase, workspaceId);
  if (!ent) return { allowed: false, reason: "Workspace not found." };
  if (ent.locked) return lockedResult();
  return ALLOWED;
}

/** Just the current pillar-count limit for a workspace's plan, or null if unlimited — used to reject an oversized AI draft before it's saved. */
export async function getPillarCountLimit(supabase: DB, workspaceId: string): Promise<{ limit: number; planName: string } | null> {
  const ent = await getWorkspaceEntitlements(supabase, workspaceId);
  if (!ent || ent.limits.pillars === null) return null;
  return { limit: ent.limits.pillars, planName: PLANS[ent.planId].name };
}

export async function canCreatePillar(supabase: DB, workspaceId: string, strategyId: string): Promise<EntitlementResult> {
  const ent = await getWorkspaceEntitlements(supabase, workspaceId);
  if (!ent) return { allowed: false, reason: "Workspace not found." };
  if (ent.locked) return lockedResult();
  if (ent.limits.pillars === null) return ALLOWED;

  const { count, error } = await supabase.from("content_pillars").select("id", { count: "exact", head: true }).eq("strategy_id", strategyId);
  if (error) throw error;
  if ((count ?? 0) < ent.limits.pillars) return ALLOWED;
  return {
    allowed: false,
    reason: `Your ${PLANS[ent.planId].name} plan includes ${ent.limits.pillars} content pillars. Upgrade for unlimited pillars.`,
    upgradeTo: cheapestPlanFor("pillars", (count ?? 0) + 1),
  };
}

export async function canCreateIdea(supabase: DB, workspaceId: string, countToAdd = 1): Promise<EntitlementResult> {
  const ent = await getWorkspaceEntitlements(supabase, workspaceId);
  if (!ent) return { allowed: false, reason: "Workspace not found." };
  if (ent.locked) return lockedResult();
  if (ent.limits.ideas === null) return ALLOWED;

  const { count, error } = await supabase.from("content_ideas").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if (error) throw error;
  const projected = (count ?? 0) + countToAdd;
  if (projected <= ent.limits.ideas) return ALLOWED;
  return {
    allowed: false,
    reason: `Your ${PLANS[ent.planId].name} plan includes ${ent.limits.ideas} saved ideas. Upgrade for unlimited ideas, or archive some existing ones.`,
    upgradeTo: cheapestPlanFor("ideas", projected),
  };
}

export async function canCreateCalendar(supabase: DB, workspaceId: string): Promise<EntitlementResult> {
  const ent = await getWorkspaceEntitlements(supabase, workspaceId);
  if (!ent) return { allowed: false, reason: "Workspace not found." };
  if (ent.locked) return lockedResult();
  if (ent.limits.calendars === null) return ALLOWED;

  const { count, error } = await supabase.from("content_calendars").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  if (error) throw error;
  if ((count ?? 0) < ent.limits.calendars) return ALLOWED;
  return {
    allowed: false,
    reason: `Your ${PLANS[ent.planId].name} plan includes ${ent.limits.calendars} active calendar${ent.limits.calendars === 1 ? "" : "s"}. Upgrade for unlimited calendars.`,
    upgradeTo: cheapestPlanFor("calendars", (count ?? 0) + 1),
  };
}

/**
 * Checks (without spending) whether this workspace's account has enough AI
 * credits for `action`. Callers must NOT call the AI provider when this
 * returns allowed: false (spec §33) — and must call
 * services/billing-service.ts's consumeAiCredits AFTER a successful
 * generation, never before.
 */
export async function canUseAI(
  supabase: DB,
  workspaceId: string,
  action: AIActionType,
): Promise<EntitlementResult & { cost: number; remaining: number; planId: PlanId | null }> {
  const ent = await getWorkspaceEntitlements(supabase, workspaceId);
  const cost = creditCost(action);
  if (!ent) return { allowed: false, reason: "Workspace not found.", cost, remaining: 0, planId: null };
  if (ent.locked) return { ...lockedResult(), cost, remaining: 0, planId: ent.planId };

  const balance = await checkAiCredits(supabase, workspaceId, ent.planId);
  if (!balance.ok) {
    return { allowed: false, reason: "We couldn't verify your AI credit balance. Please try again.", cost, remaining: balance.remaining, planId: ent.planId };
  }
  if (balance.remaining < cost) {
    return {
      allowed: false,
      reason:
        balance.remaining === 0
          ? `You don't have enough AI credits for this action. This action requires ${cost} AI credit${cost === 1 ? "" : "s"}.`
          : `This action requires ${cost} AI credit${cost === 1 ? "" : "s"}. You have ${balance.remaining} remaining.`,
      upgradeTo: ent.planId === "free" ? "creator" : ent.planId === "creator" ? "pro" : undefined,
      cost,
      remaining: balance.remaining,
      planId: ent.planId,
    };
  }
  return { allowed: true, cost, remaining: balance.remaining, planId: ent.planId };
}
