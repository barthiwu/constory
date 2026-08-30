# Constory — Phase 7.5: Monetization, Pricing, Subscriptions & Paystack Payment Infrastructure — Completion Report

Covers both specification documents received for this phase: v1.0 ("Monetization, Pricing, Subscriptions & AI Credit Infrastructure") and its v1.1 update, which formally selects **Paystack** as the payment provider and adds the payment-integration requirements. This report reflects the combined, final state of the implementation.

## A. Repository inspection

**What existed.** Phases 1-7: the full onboarding/brand/strategy/pillars/ideas/calendar workflow, the review-before-save AI generation pattern, the intelligence module, and a mature RLS/authorization model — but no concept of a plan, a price, a credit, or a payment anywhere in the codebase. Every account had unlimited access to every feature.

**What was preserved.** All existing architecture and every previously-passing test. This phase is additive: a new billing/subscriptions/credits layer sits alongside the existing feature code, with entitlement checks inserted at the points where the spec requires them (brand/strategy/pillar/idea/calendar creation, every AI generation route) rather than any existing table, RLS policy, or business-logic function being rewritten.

**What was changed.** Listed in full in sections B-G below; the complete file list is in section I.

**What was intentionally not changed.** `content_strategies` was deliberately *not* given a hard per-workspace row-count cap (see section C) because `saveStrategy()` inserts a new history row on every save by design — capping it would have permanently blocked Free users from ever regenerating their one strategy after the first save. The gap is closed differently: `getPillarCountLimit` rejects an oversized AI-drafted pillar set at save time instead.

## B. Plans, pricing & billing model

Single source of truth: `lib/billing/plans.ts`. Three plans, matching the spec exactly:

| Plan | Monthly | Quarterly (-5%) | Annual (-20%) | Brands | AI credits/mo |
| --- | --- | --- | --- | --- | --- |
| Free | $0 | $0 | $0 | 1 | 10 |
| Creator | $12 | $34.20 | $115.20 | 3 | 85 (75 + 10 base) |
| Pro | $23 | $65.55 | $220.80 | 10 | 260 (250 + 10 base) |

All prices are stored and computed in whole US cents to avoid float rounding. Free plan credits are folded into every paid plan's total as a baseline per the spec, and only the combined total is ever shown to the user. Per-plan limits on strategies/pillars/ideas/calendars are also defined here (`null` = unlimited) and read everywhere else in the app via `getPlanEntitlements()` — no limit or price is hard-coded a second time anywhere.

Billing is modeled **per account owner**, not per workspace/brand. This was a deliberate resolution of an ambiguity in the spec (which refers to both "brands" and "workspaces" when describing limits): one subscription and one credit pool per owner, with the plan's brand limit enforced as an account-wide cap on how many workspaces that owner may have active. This prevents a credit-multiplication exploit (creating extra workspaces to get extra credit pools) while still satisfying the literal per-brand cap. The reasoning is documented at the top of `supabase/migrations/0008_billing_plans_subscriptions.sql`.

## C. AI credit system

- **Cost table** (`lib/billing/credit-costs.ts`): `generate_post`/`regenerate_post`/`improve_content` = 1 credit, `generate_ideas` = 2, `generate_strategy`/`generate_calendar` = 4. `creditCost(action)` is the single lookup point; nothing computes a cost inline.
- **Atomic, concurrency-safe deduction**: `consume_ai_credits(p_workspace_id, p_action_type, p_credits, p_plan_allocation)`, a `SECURITY DEFINER` SQL function in migration `0008`, using `select ... for update` to row-lock the caller's `credit_balances` row before checking/deducting — two concurrent requests can never both succeed against the same last credit. It also supports a zero-credit "peek" mode (used by `canUseAI`'s pre-check, logs nothing) and lazily rolls the credit period over (resets `credits_used`, adopts the current plan's allocation) the first time it's called after the period has elapsed, exactly like `getResolvedSubscription` lazily resolves an expired cancellation.
- **Spend-after-success discipline**: every AI route (`app/api/ai/{ideas,strategy,calendar,post}/route.ts`) checks credits *before* calling the AI provider and only calls `consumeAiCredits` *after* the generation succeeds — a failed generation never costs a credit, and credits are never spent speculatively.
- **Usage ledger**: every successful spend writes a row to `ai_usage_ledger` (action type, credits used, workspace, user, timestamp) — `listRecentUsage` surfaces this for the billing page.
- **Verification caveat, stated plainly**: the row-lock is what actually guarantees safety under real concurrent load; the SQL test for this (`07_billing_test.sql`) exercises the same sequence of calls a race would produce, but sequential calls in a test script cannot *prove* concurrent safety the way a live concurrent-load test would. This limitation is called out in both the migration file and the test file itself.

## D. Entitlement enforcement

`lib/billing/entitlements.ts` centralizes every plan-gated check, all server-side, all reading the *server's* record of the owner's plan — never a client-supplied value: `canCreateBrand`, `getPillarCountLimit`/`canCreatePillar`, `canCreateIdea`, `canCreateCalendar`, `canUseAI` (credits + AI-feature gating together). Wired into every relevant server action and API route: `app/app/onboarding/actions.ts`, `app/app/actions.ts`, `app/app/(shell)/{ideas,strategy,calendars}/actions.ts`, and all four `app/api/ai/*/route.ts` handlers. `canCreateStrategy` is a documented no-op (see section A) — strategy creation is instead gated by workspace `billing_locked` status and the pillar-count check at save time.

**Downgrade grace handling** (never deletes data): `workspaces.billing_locked` (migration `0008`) marks a workspace read-only without touching a single row of its content. `lockExcessWorkspaces` (`services/billing-service.ts`) deterministically keeps the oldest N workspaces active and locks the rest whenever a plan change lowers the brand limit; `ManageActiveBrands` (`components/billing/manage-active-brands.tsx`) + `setActiveWorkspacesAction` let the owner explicitly pick a different active set instead, validated against the new plan's limit before saving.

## E. Payment provider architecture & Paystack integration

**Abstraction boundary** (`lib/billing/provider.ts`): a `BillingProvider` interface (`createCheckout`, `cancelSubscription`, `resumeSubscription`, `changePlan`, `verifyWebhook`) is the *only* thing the rest of the app talks to (`app/app/(shell)/settings/billing/actions.ts`, the webhook route). `getBillingProvider()` selects the implementation purely from environment: `ManualBillingProvider` (no payment collected, plan changes apply immediately — the default with no `PAYSTACK_SECRET_KEY` set) or `PaystackBillingProvider`, chosen automatically the moment `PAYSTACK_SECRET_KEY` is configured. No other file imports the Paystack-specific code directly.

**Paystack REST client** (`lib/billing/paystack-client.ts`): a minimal typed `fetch` wrapper — no SDK dependency, since this environment can't install-and-verify a third-party SDK against a live account anyway, and Paystack's API surface needed here is three plain REST operations: `POST /transaction/initialize`, `GET /transaction/verify/:reference`, and HMAC-SHA512 webhook signature verification (`crypto.timingSafeEqual`, never a plain `===`).

**Checkout flow** (`PaystackBillingProvider.createCheckout`, `lib/billing/paystack-provider.ts`): Free plan changes apply directly, no checkout. Paid plans resolve the Paystack plan code via `getPaystackPlanCode(planId, interval)` and the price via the same server-side `priceForInterval()` used everywhere else (never a client-supplied amount), call `initializeTransaction` with validated metadata (`user_id`, `plan_slug`, `billing_interval`, `environment`), and return a `redirectUrl` for the browser to navigate to — `changePlanAction` now requires the caller's authenticated email (needed by Paystack), and `PlanPicker` (`components/billing/plan-picker.tsx`) navigates via `window.location.href` when a `redirectUrl` comes back, instead of only toasting.

**Activation — never client-driven.** Nothing in the browser ever marks a plan active. Two independent, server-authoritative paths both funnel into `activatePaidPlanFromPayment` (`services/billing-service.ts`), which updates the subscription and resets the credit period in one call:

1. **Webhook** (`app/api/webhooks/paystack/route.ts`) — reads `request.text()` *before* any JSON parsing (the raw bytes are what the signature covers), verifies `x-paystack-signature` via the provider, and only then parses and acts on `charge.success` (activates), `invoice.payment_failed` (marks `past_due`), and `subscription.disable` (mirrors a Paystack-side cancellation locally). Every event is recorded in `billing_events` first via `recordBillingEvent`, which relies on a unique `(provider, provider_event_id)` constraint — a redelivered webhook is detected and short-circuited before any activation logic runs a second time.
2. **Verify-on-return** (`lib/billing/paystack-provider.ts`'s `verifyAndActivatePaymentReference`, called from `app/app/(shell)/settings/billing/page.tsx` when the URL carries `?reference=`) — calls `GET /transaction/verify/:reference` directly rather than trusting the redirect itself, checks the transaction's own metadata `user_id` against the signed-in caller (rejects a mismatch outright), and shares the same `billing_events` idempotency table under a distinct `verify_return:<reference>` key. This path exists specifically because this sandbox — and most local dev setups — have no publicly reachable URL for Paystack to deliver a webhook to; it's the only realistically testable authoritative-activation path in those environments, and remains a legitimate, documented alternative even in production per the spec.

The billing page reads `?reference=`, verifies, and immediately `redirect()`s to a clean URL carrying only a `?payment=<status>` flag, so a refresh or back-navigation can never re-submit the same reference; a small effect in `BillingView` shows a one-time toast for the outcome (`success`, `not_successful`, `owner_mismatch`, `incomplete_metadata`, `error`) and strips the query param.

**Plan codes**: centrally read from six `PAYSTACK_PLAN_CODE_{CREATOR,PRO}_{MONTHLY,QUARTERLY,ANNUAL}` env vars via `lib/billing/paystack-plan-codes.ts` — never hard-coded, and `getPaystackPlanCode` throws rather than guessing if a code is missing for a given (plan, interval) pair.

## F. Security posture

- **Never trust client-supplied plan, price, or credit values.** Every price comes from `priceForInterval()`, every plan code from `getPaystackPlanCode()`, every entitlement from the server's own read of `subscriptions`/`credit_balances` — the browser only ever sends *which* plan/interval the user picked, never a cost.
- **RLS isolation.** `subscriptions`, `credit_balances`, and `ai_usage_ledger` (migration `0008`) are scoped so only the account owner can write, and only a workspace member (via `can_view_billing()`) can read — verified directly against a real Postgres instance in `07_billing_test.sql` using a fresh, zero-relationship "Carol" account specifically to avoid a false-positive from an already-related test user (see section H's "Ledger/isolation testing" note). `billing_events` (migration `0009`) has RLS enabled with **no** policies for `authenticated` at all — it is written only by the service-role client from the webhook route and the verify-on-return path, since an inbound webhook carries no Supabase session for RLS to scope to in the first place.
- **Atomic credit deduction** via row-locked `SECURITY DEFINER` SQL function (section C) — no read-then-write race in application code.
- **`apply_plan_change` is owner-only**, enforced inside the function itself (`is_billing_owner()`), not just in the calling TypeScript — verified in `07_billing_test.sql` by having a non-owner member (Bob) attempt it directly and confirming the function raises and Alice's plan is unchanged.
- **Secret keys never reach the client.** `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` are read only in server-only modules (`lib/billing/paystack-client.ts`, never imported from a `"use client"` file); neither is prefixed `NEXT_PUBLIC_`; `.env.example` holds placeholders only and `.env.local` is git-ignored, unchanged from the existing project convention.
- **Webhook signature verification is HMAC-SHA512 over the raw request body**, compared with `crypto.timingSafeEqual` (constant-time — never a `===` string compare, which would leak timing information about how many leading bytes matched). Verified directly with 9 unit tests (`lib/billing/paystack-client.test.ts`) covering a valid signature, a tampered body, a signature made with the wrong secret, a missing header, an unconfigured environment, the `PAYSTACK_WEBHOOK_SECRET`-over-`PAYSTACK_SECRET_KEY` precedence, and a same-length-but-wrong signature (exercising the `timingSafeEqual` branch specifically, not just the length-mismatch shortcut).
- **Idempotent webhook/verify-on-return processing** — a unique `(provider, provider_event_id)` constraint in `billing_events` is the actual enforcement; `recordBillingEvent` treats the resulting `23505` unique-violation as "already processed," not an error.
- **No raw card details are ever collected by Constory.** Every payment goes through Paystack's own hosted checkout page; the application never renders a card form.
- **Failed payment never deletes data.** `invoice.payment_failed` only sets `status = 'past_due'` — no workspace, brand, strategy, idea, or calendar is ever removed by a billing event.
- **No independent currency conversion.** Nothing in the codebase calculates or displays a Naira (or any other) amount — pricing is USD-only throughout (`formatCents` always renders `$`), matching the spec's explicit instruction not to show an unofficial exchange-rate figure.

## G. UI

- **`/pricing`** (`app/(marketing)/pricing/page.tsx`, `components/pricing/{pricing-section,comparison-table,pricing-faq}.tsx`): billing-interval toggle (monthly/quarterly/annual with the discount shown), three plan cards with feature lists and credit counts, a comparison table, an FAQ, and — per spec v1.1 §32 — a plain, non-promissory line under the plan cards: *"Secure payments powered by Paystack. Prices are shown in USD. Available payment methods depend on your location and card issuer."* No claim about auto-renewal is made for any specific channel. Linked from the marketing nav and footer.
- **`Settings → Billing`** (`app/app/(shell)/settings/billing/{page,actions}.tsx`, `components/billing/{billing-view,plan-picker,credit-meter,manage-active-brands}.tsx`): current plan + status badge, cancel/resume, an AI-credit meter (used/allocation, reset date), the active-brands manager (shown only when relevant), and the plan picker itself. The plan picker's footer copy is provider-aware: it states the Manual-provider disclosure only when Paystack isn't configured, and the Paystack disclosure ("nothing changes until payment is verified") when it is — it no longer unconditionally claims no provider is connected.
- **Dashboard**: a credit meter and a locked-workspace banner (`app/app/(shell)/dashboard/page.tsx`) so a downgraded owner sees their state without having to visit the billing page first.

## H. Payment provider integration status — what is and isn't live

This is the section referenced by the in-code comments throughout `lib/billing/`.

**Implemented and verified from within this environment:**
- The full billing/entitlement/credit data model, RLS policies, and atomic credit-deduction function — verified against a real local PostgreSQL 16 instance running the actual migration files (`./supabase/tests/run.sh`), not a mock.
- The `BillingProvider` abstraction, the `ManualBillingProvider` fallback, and the `PaystackBillingProvider` implementation — verified by `npx tsc --noEmit` (clean), `npm run lint` (clean), and `npm run build` (succeeds; `/api/webhooks/paystack` and `/app/settings/billing` both compile and register as routes).
- Paystack's webhook-signature HMAC-SHA512 scheme and the plan-code lookup's fail-closed behavior — verified with 13 new unit tests, independent of any network call (`lib/billing/paystack-client.test.ts`, `lib/billing/paystack-plan-codes.test.ts`).
- Every code path's *shape* — checkout initialization request, verify-transaction request, webhook event handling, verify-on-return handling — has been read through end-to-end against Paystack's documented request/response fields as understood at implementation time, and type-checks cleanly through the full call chain from route handler down to the SQL function.

**Not verified from within this environment, and why — read this before claiming either "TEST" or "LIVE" integration is complete:**
- **No `PAYSTACK_SECRET_KEY` (test or live) was ever provided to this session.** The Paystack provider has never actually been instantiated or exercised end-to-end here; `getBillingProvider()` has run only in its `ManualBillingProvider` branch throughout development and every regression run.
- **This sandbox has no network path to Paystack's API.** `curl https://api.paystack.co/bank` returns `000`/connection failure from here — confirmed again this session.
- **This sandbox also has no network path to the real Supabase project** referenced in `.env.local` (`curl` to the project's own URL is rejected by the sandbox's organization egress policy) — so even a self-contained webhook-route test (POST a correctly-signed payload to the local dev server and inspect the resulting database rows) could not be run against real project data from here; it would require either a locally-simulated Postgres wired up as this app's runtime database, or running the test from the user's own machine.
- **Given both of the above, neither "PAYSTACK TEST INTEGRATION COMPLETE" nor "PAYSTACK LIVE INTEGRATION COMPLETE" can be honestly stated.** The v1.1 spec asks the report to state exactly one of those two phrases; doing so here would misrepresent what has actually been exercised, which the spec itself (v1.0's "do not fabricate live payment functionality" instruction) explicitly asks this report to avoid. The accurate status is: **Paystack integration is code-complete and internally consistent, but has zero verified transactions of any kind (test or live) — the payment-specific code paths (checkout initialization, webhook receipt, verify-on-return, signature verification against a real Paystack-signed payload) have not been run against Paystack's actual API even once.**

**What it would take to reach a legitimate "PAYSTACK TEST INTEGRATION COMPLETE":**
1. A Paystack test-mode secret key, plus test-mode Plan codes for all six (plan, interval) pairs, set as env vars on a machine/deployment that *does* have network access to `api.paystack.co` — this sandbox does not, so this step cannot happen here.
2. Run the app there with those env vars, use a Paystack test card to complete a real hosted checkout, and confirm the redirect lands back on `/app/settings/billing?reference=...` with a `?payment=success` toast and the plan/credits actually updated.
3. Separately confirm webhook delivery: either deploy somewhere with a public URL and register it as the Paystack webhook endpoint, or use a tunnel (ngrok or similar) from a machine that can reach both Paystack and this app; trigger a `charge.success` event and confirm `billing_events` gets exactly one row and the subscription activates exactly once even if Paystack retries delivery.
4. Only after both of those succeed with test keys should the report be updated to state "PAYSTACK TEST INTEGRATION COMPLETE"; live-key confirmation is a distinct, later step requiring the same walkthrough with production credentials and real payment method.

## I. Database changes

- **`supabase/migrations/0008_billing_plans_subscriptions.sql`**: `subscriptions`, `credit_balances`, `ai_usage_ledger` tables; `workspaces.billing_locked boolean`; `handle_new_profile_billing()` trigger (+ backfill for pre-existing accounts); `is_billing_owner()`/`can_view_billing()` helper functions; `consume_ai_credits(...)` and `apply_plan_change(...)` `SECURITY DEFINER` functions (`set search_path = public`, matching the existing `is_workspace_member`/`is_workspace_editor` pattern); RLS policies on all three new tables. The `subscriptions.provider` check constraint is `('none', 'manual', 'paystack')`.
- **`supabase/migrations/0009_paystack_billing_events.sql`**: `billing_events` table (`provider`, `provider_event_id` unique together, `event_type`, `owner_id`, `status`, `detail`) — RLS enabled, no `authenticated` policies (service-role only).
- **`types/database.ts`**: `PlanId`, `SubscriptionStatus`, `BillingInterval`, `BillingProviderName` (`"none" | "manual" | "paystack"`), `AIActionType`, `UsageRequestStatus`, `Subscription`, `CreditBalance`, `AiUsageLedgerRow`, `ConsumeAiCreditsResult`, `BillingEvent`/`BillingEventStatus`, and the corresponding `Database.Tables`/`Database.Functions` entries for `subscriptions`, `credit_balances`, `ai_usage_ledger`, `billing_events`, `consume_ai_credits`, `apply_plan_change`.

## J. Tests

- **Unit tests** (`npx vitest run`): **144 passing**, 0 failing — 131 pre-existing + 13 new this session (`lib/billing/paystack-client.test.ts`: 9, covering the HMAC signature scheme end-to-end including the `timingSafeEqual` branch and the webhook-secret-precedence rule; `lib/billing/paystack-plan-codes.test.ts`: 4, covering the missing-code failure mode and the centralized-config guarantee). `lib/billing/plans.test.ts` (14) and `lib/billing/credit-costs.test.ts` (2) were already in place from the v1.0 portion of this phase and remain green.
- **TypeScript** (`npx tsc --noEmit`): clean, zero errors. (One real type error was found and fixed during this session: `services/billing-service.ts`'s `activatePaidPlanFromPayment` built its Supabase `.update()` payload as a bare `Record<string, unknown>`, which Supabase's generated types reject — retyped as `Partial<Subscription>`.)
- **Lint** (`npm run lint`): clean, zero errors, zero warnings.
- **Database / RLS suite** (`./supabase/tests/run.sh`): all 7 scripts run clean against a real local PostgreSQL 16 instance with every migration (`0001`-`0009`) applied in order. `07_billing_test.sql` specifically covers: a true stranger (fresh "Carol" account, zero relationship to Alice — introduced specifically to avoid a false-positive, since Bob was already a legitimate viewer on one of Alice's workspaces from an earlier script) cannot read or spend Alice's billing state; a workspace member who isn't the owner (Bob) can read but not write Alice's subscription; `consume_ai_credits` deducts atomically, logs to the ledger, rejects an insufficient-balance spend without any side effect, supports a zero-credit peek, and rolls the credit period over correctly; `apply_plan_change` is owner-only, enforced by the function itself. Every `ERROR` line in the full run's output (7 total) is one of the deliberate policy-rejection/constraint/authorization checks the scripts test for — confirmed by re-running with output captured and grepped in full, not just spot-checked.
- **Production build** (`npm run build`): succeeds. All 24 routes generate correctly, including the two new ones (`/api/webhooks/paystack`, `/pricing`) and the existing `/app/settings/billing` now compiling with its search-params-driven verify-on-return branch.
- **Not run, and why**: no live call to Paystack's API or to the real Supabase project this app's `.env.local` points at — both are unreachable from this sandbox (see section H). No real-browser click-through of the new pricing/billing UI was performed in this session (Chromium is available in this environment but wasn't exercised against these specific new screens); a manual pass — especially the plan-picker → redirect → verify-on-return round trip, which needs a reachable Paystack account to test meaningfully — is recommended before shipping.

## Definition of Done checklist

- [x] Three plans (Free/Creator/Pro) with monthly/quarterly(-5%)/annual(-20%) pricing, single source of truth, no duplicated numbers.
- [x] Centralized AI credit system with per-action costs and atomic, concurrency-safe deduction.
- [x] Centralized entitlement system, enforced server-side, never trusting a client-supplied plan/credit/price value.
- [x] Public `/pricing` page.
- [x] `Settings → Billing` page (plan, status, credits, cancel/resume, active-brand management, plan picker).
- [x] Payment-provider abstraction layer (`BillingProvider`), decoupling the rest of the app from the concrete processor.
- [x] Paystack selected and implemented as the concrete provider, activated automatically once `PAYSTACK_SECRET_KEY` is configured; a no-payment `ManualBillingProvider` fallback keeps every non-Paystack-configured environment (including this one) fully functional.
- [x] Upgrade/downgrade flows that never delete data; downgrade grace handling via `billing_locked` + owner-chosen active-brand selection.
- [x] RLS isolation on every new table; `billing_events` has no `authenticated` policies at all.
- [x] Paystack-hosted checkout (init → redirect → webhook/server-verify → activate) — both a webhook path and a verify-on-return path implemented, sharing one idempotency table.
- [x] One-time vs. recurring-capable payment channels: no auto-renewal claim is made anywhere for a channel that doesn't support it; the pricing-page copy is deliberately non-promissory about specific payment methods.
- [x] Centrally-configured (not hard-coded) Paystack plan codes.
- [x] Correct env var names (`PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, six `PAYSTACK_PLAN_CODE_*`), server-only, never in the client bundle, never committed (`.env.example` holds placeholders; `.env.local` is git-ignored).
- [x] Webhook signature verification (HMAC-SHA512, constant-time compare) + idempotent processing via a unique `(provider, provider_event_id)` constraint.
- [x] Subscription activation driven only by server-verified payment data — never a client-side "success" claim.
- [x] USD-only pricing; no independently-calculated currency conversion anywhere in the app.
- [x] Regression suite green: typecheck, lint, unit tests, build, and the full SQL/RLS suite.
- [ ] **A verified test-mode (or live-mode) Paystack transaction.** Explicitly not achievable from within this sandbox — see section H for exactly what's blocking it and what it would take. This is the one item in the spec's Definition of Done this report cannot check off, and it is called out here rather than silently omitted or falsely claimed.

## K. Out of scope (per both spec versions, deliberately not built)

AI credit marketplace or purchased credit packs; team/agency plans; social media publishing or social OAuth; enterprise billing, invoices, or tax automation; multiple currencies or a separate Naira pricing page/independent conversion display; a complex admin billing dashboard; any payment provider other than Paystack (Flutterwave, Stripe, Lemon Squeezy) or multi-provider routing. None of these were implemented, and no code anywhere gestures toward them.
