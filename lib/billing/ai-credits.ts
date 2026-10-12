// Reserve-then-settle AI credits (migration 0028). See that migration's header for the race this closes.
//
//   reserve  -> credits are deducted atomically BEFORE the AI call (per-owner row lock in the database)
//   settle   -> the generation succeeded; the hold becomes a permanent 'success' ledger row
//   refund   -> the generation failed; the credits go back
//
// reserve runs with the caller's own session (the database checks that they are an owner/admin/editor of
// the workspace -- a read-only 'viewer' can never spend). settle/refund are service-role only on purpose:
// the reservation id is visible to the owner in the ledger while a request is in flight, so a client must
// not be able to refund its own in-flight generation.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { notifyLowCreditsIfNeeded } from "@/services/notification-service";
import type { PlanId } from "@/types/database";
import type { AIActionType } from "@/lib/billing/credit-costs";

export interface AiReservation {
  id: string;
  workspaceId: string;
  /** Credits left after this hold, and the period's allocation -- used for the low-credits notification. */
  remaining: number;
  allocation: number;
}

export type ReserveOutcome =
  | { ok: true; reservation: AiReservation }
  | { ok: false; status: number; error: string; upgradeTo?: PlanId };

type SupabaseUserClient = Awaited<ReturnType<typeof createClient>>;

/** Maps a database refusal reason to the HTTP status + user-facing message. Pure, so it's unit-tested. */
export function describeReserveFailure(reason: string, cost: number, remaining: number): { status: number; error: string; upgradeTo?: PlanId } {
  switch (reason) {
    case "insufficient_credits":
      return {
        status: 402,
        error:
          remaining === 0
            ? `You don't have enough AI credits for this action. This action requires ${cost} AI credit${cost === 1 ? "" : "s"}.`
            : `This action requires ${cost} AI credit${cost === 1 ? "" : "s"}. You have ${remaining} remaining.`,
      };
    case "viewer_cannot_use_ai":
      return {
        status: 403,
        error: "You have view-only access to this brand, so you can't use AI credits. Ask an owner or admin to give you editor access.",
      };
    case "workspace_locked":
      return {
        status: 402,
        error: "This brand is locked because your plan doesn't currently cover it. Manage your active brands from Settings → Billing.",
      };
    case "not_a_member":
    case "workspace_not_found":
      return { status: 404, error: "Workspace not found." };
    default:
      return { status: 500, error: "We couldn't verify your AI credit balance. Please try again." };
  }
}

/** Holds `cost` credits for `workspaceId`. Call this BEFORE any AI work; pair every success with settle or refund. */
export async function reserveAiCredits(
  supabase: SupabaseUserClient,
  workspaceId: string,
  action: AIActionType,
  cost: number,
  currentPlan?: PlanId | null,
): Promise<ReserveOutcome> {
  const { data, error } = await supabase.rpc("reserve_ai_credits", {
    p_workspace_id: workspaceId,
    p_action_type: action,
    p_credits: cost,
  });
  if (error) {
    console.error("[ai-credits] reserve failed:", error);
    return { ok: false, ...describeReserveFailure("unknown_error", cost, 0) };
  }
  const row = data?.[0];
  if (!row || !row.ok || !row.reservation_id) {
    const failure = describeReserveFailure(row?.reason ?? "unknown_error", cost, row?.remaining ?? 0);
    const upgradeTo = row?.reason === "insufficient_credits" ? (currentPlan === "free" ? "creator" : currentPlan === "creator" ? "pro" : undefined) : undefined;
    return { ok: false, ...failure, upgradeTo };
  }
  return {
    ok: true,
    reservation: { id: row.reservation_id, workspaceId, remaining: row.remaining, allocation: row.monthly_allocation },
  };
}

/** The generation succeeded: make the hold permanent and fire the low-credits notification if due. Never throws. */
export async function settleAiCredits(reservation: AiReservation): Promise<void> {
  try {
    const admin = createAdminClient();
    let { error } = await admin.rpc("settle_ai_credits", { p_reservation_id: reservation.id });
    if (error) ({ error } = await admin.rpc("settle_ai_credits", { p_reservation_id: reservation.id })); // one retry
    if (error) {
      // Worst case the hold is returned by the database's 10-minute self-heal; never fail the user's request over it.
      console.error("[ai-credits] settle failed:", error);
      return;
    }
    const { data: ws } = await admin.from("workspaces").select("owner_id").eq("id", reservation.workspaceId).maybeSingle();
    if (ws?.owner_id) await notifyLowCreditsIfNeeded(admin, ws.owner_id, reservation.remaining, reservation.allocation);
  } catch (err) {
    console.error("[ai-credits] settle threw:", err);
  }
}

/** The generation failed: give the held credits back. Idempotent and never throws (the database also self-heals stale holds). */
export async function refundAiCredits(reservation: AiReservation): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("refund_ai_credits", { p_reservation_id: reservation.id });
    if (error) console.error("[ai-credits] refund failed:", error);
  } catch (err) {
    console.error("[ai-credits] refund threw:", err);
  }
}
