# Constory Phase 7.5 — Independent Implementation Audit Report

**Audit scope:** Monetization, Pricing, Subscriptions, AI Credits, Paystack Payment Infrastructure
**Audited against:** the approved Phase 7.5 v1.0/v1.1 specification and this document's own audit specification
**Method:** see "Audit methodology" below — this is not read the completion report and confirm; it is fresh source inspection plus live execution.

## Audit methodology (read this before the verdicts)

This audit was performed by three independent subagents, each launched with **no memory of how Phase 7.5 was built** — they were pointed only at the repository and the literal audit requirements, explicitly instructed not to trust code comments, docstrings, or `PHASE7_5_COMPLETION_REPORT.md`'s own claims. Each agent read the actual source, ran the actual test suites, and in one case reproduced a finding live against a scratch database seeded from the real migration files. I then independently re-verified every CRITICAL/HIGH claim myself by reading the same source a second time before including it here — none of the findings below are taken on an agent's word alone.

One limitation stated plainly: I am the same session that built this feature, so "independent" here means independent *subagents* with fresh context, cross-checked by me — not a literal third-party human reviewer. Where that matters, it's noted.

---

## A. Executive Verdict

```text
PHASE 7.5:
CORRECTIONS REQUIRED (as found) → see "Corrections Applied" section at the end for what has since been fixed in this same session
```

One **CRITICAL** and two **HIGH** findings were confirmed, all with concrete exploit paths, not theoretical concerns. The application-layer code (Next.js server actions, API routes, the Paystack client/provider) is well-built and consistently enforces the spec's requirements. The vulnerabilities are at the **database layer** — Postgres RLS policies and `SECURITY DEFINER` RPC functions that are reachable directly via Supabase's auto-generated REST API (`PostgREST`), bypassing the entire Next.js application (and therefore bypassing Paystack, price validation, and entitlement checks) for any authenticated user calling them directly with their own valid session token. This is exactly the class of attack the spec's section 4.2 describes ("client sends price=$1, plan=Pro") — just one layer lower than where the app-layer code defends against it.

## B. Completion Percentage

```text
Requirements Passed:        30
Requirements Partial:        6
Requirements Failed:         3   (1 CRITICAL, 2 HIGH — see Security Findings)
Not Verifiable Live:         1   (live Paystack transaction — no network path to Paystack or the real Supabase project from this environment)
```

(Counts reflect the itemized requirements in sections 4–43 of the audit spec, consolidated in the matrix below; several spec items bundle multiple sub-checks and are scored on their weakest verified sub-part.)

## C. Requirements Matrix

| ID | Requirement | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Exact approved pricing (Free/Creator/Pro × monthly/quarterly/annual) | PASS | `lib/billing/plans.ts:69-116`; recomputed independently (1200×3×0.95=3420, 1200×12×0.8=11520, 2300×3×0.95=6555, 2300×12×0.8=22080) | `pricing-faq.tsx:12` and `pricing-section.tsx`'s `FEATURE_LINES` hand-write credit/limit numbers in prose, disconnected from `PLANS` — drift risk, not a current error |
| 2 | Price authority — server never trusts client price/plan | **FAIL (CRITICAL)** | See Security Findings §1 | App layer (`paystack-provider.ts:66`, `services/billing-service.ts`) is correct; the DB layer is not |
| 3 | Currency — USD only, no independent conversion | PASS | grep for NGN/Naira/₦/exchangeRate across the repo: zero matches; `paystack-client.ts:54` types currency as literal `"USD"` | |
| 4/6 | Plans exist, centralized | PASS | `lib/billing/plans.ts` single source; `types/database.ts:179,181` hand-redeclares `PlanId`/`BillingInterval` as string literals rather than importing — type-only duplication | |
| 5 | AI credit allocations: Free=10, Creator=85, Pro=260 | PASS | `plans.ts:81,96,112`; asserted in `plans.test.ts:60-65` by summing the internal base+plan split, not restating it | |
| 7 | Entitlement system centralized | PARTIAL | `lib/billing/entitlements.ts` — 6 functions, 5 are called from real server actions/routes; `canCreateStrategy` (`:94-99`) has **zero call sites anywhere in the app** — dead code | |
| 8/9/10 | Credit period is monthly regardless of billing interval; no front-loading | PASS | Both activation paths hardcode `nextPeriodEnd("monthly", ...)` (`billing-service.ts:173,260`); SQL rollover is `+ interval '1 month'` (`0008...sql:229`) regardless of `billing_interval` | Undermined at the DB layer by the CRITICAL finding — a direct RPC call can set any period |
| 11 | AI credit consumption order: auth → entitlement/credit check → AI call → deduct only after success | PASS | Verified in all 4 routes (`app/api/ai/{ideas,post,strategy,calendar}/route.ts`) by reading literal try/catch structure | |
| 12 | Failed AI request never consumes a credit | PASS | Deduction call is textually after the AI call, inside the same `try`; `catch` blocks have no deduction path, in all 4 routes | No test asserts this directly — verified by code reading only |
| 13 | Concurrent requests cannot overspend | PASS | `select ... for update` row lock inside `consume_ai_credits` (`0008...sql:218`), single atomic call; live-verified via the sequential-contention test | Test is sequential, not a true concurrent-connection race — the file itself says so |
| 14 | AI usage ledger is reliable (user/workspace/action/cost/timestamp) | PASS | `ai_usage_ledger` schema + insert-on-success only (`0008...sql:254-255`); `request_status` column's `'failed'` branch is defined but never written (unreachable) | |
| 15/16 | Server-side enforcement, not just frontend | PASS | All entitlement checks live in `"use server"` files / route handlers | |
| 17 | Account-level credits — brands don't multiply allowance | PASS | `credit_balances.owner_id unique`; `consume_ai_credits` resolves owner from the workspace, one pool per owner regardless of brand count | |
| 18 | Paystack provider abstraction | PASS | `lib/billing/provider.ts:25-46` interface; grep confirms no other app code imports Paystack-specific modules directly | |
| 19 | Checkout flow price authority (app layer) | PASS | `paystack-provider.ts:44-89` — server re-resolves user/plan/price before calling Paystack; tampering `billingInterval` can only select a *higher* price bucket, never lower | |
| 20 | No raw card storage, hosted checkout | PASS | Zero matches for card/cvv fields; checkout is a full-page redirect to Paystack's `authorization_url` | |
| 21 | No false auto-renewal claims for non-recurring channels | PASS | Only disclosure strings found are correctly hedged ("payment methods depend on your location...", no "your card will be charged automatically" claim anywhere) | |
| 22/23 | Server-side payment verification, incl. verify-on-return metadata/owner validation | PASS | `verifyAndActivatePaymentReference` (`paystack-provider.ts:147-190`) calls Paystack's real verify endpoint and rejects on `metadata.user_id !== expectedOwnerId` (session-derived, not client-supplied) | **PARTIAL** sub-note: neither activation path re-checks that the paid amount equals `priceForInterval(...)` — trusts `metadata.plan_slug` alone. Not currently exploitable (metadata isn't client-writable) but no defense-in-depth re-check |
| 24/25/26 | Webhook: raw-body signature check before parsing, HMAC-SHA512, constant-time compare, reject-before-process, DB-level idempotency | PASS | `route.ts:23-33` order confirmed; `paystack-client.ts:113-123` uses `crypto.timingSafeEqual`; `0009...sql:28` unique `(provider, provider_event_id)` constraint, not app-level dedup | |
| 27 | No code path activates a paid plan without a verified payment (app-layer) | PASS (app layer) / **FAIL (DB layer)** | Every app-layer caller of `activatePaidPlanFromPayment` requires prior webhook signature or verify-transaction success | Same CRITICAL finding — the RPC surface bypasses this entirely |
| 28 | Subscription states are real, DB-enforced | PASS | `check (status in ('active','trialing','past_due','cancelled','expired'))` — a real constraint | |
| 29 | Cancellation preserves paid access until period end | PASS | `getResolvedSubscription()` only flips to Free once `cancel_at_period_end && periodEnded` | |
| 30 | Payment failure doesn't delete data | PASS | Zero delete/drop calls anywhere near payment-failure handling; only a status flip to `past_due` | |
| 31 | Upgrade flow — no duplicate subscriptions, credits updated safely | PASS | `subscriptions.owner_id unique`; both write paths `UPDATE`, never `INSERT`; credits reset atomically alongside plan change | |
| 32/34 | Downgrade — no data deletion | PASS | Zero delete calls in the plan-change path | |
| 32/34 | Downgrade — locked workspaces actually blocked from new content, server-side | **FAIL (HIGH)** | See Security Findings §2 | |
| 33 | Workspace/brand limits 1/3/10, server-enforced | PASS | `plans.ts:76,91,107`; enforced in `createWorkspaceAction`/`startOnboardingAction` via `canCreateBrand` | Check-then-insert isn't in one transaction — a very tight double-submit race could create one workspace past the limit; low practical risk, self-corrects on next lock pass |
| 35 | Free transition (expiry/cancellation) — data stays, entitlements change, correctly resolved everywhere state is read | PARTIAL | Subscription-state resolution (`getResolvedSubscription`) is invoked everywhere it needs to be; **the credit-balance half is not** — see Security Findings §3 | |
| 36 | Billing page shows real backend state (plan, status, interval, next date, credits, reset date, upgrade/downgrade/cancel actions) | PASS | `billing/page.tsx:40-44` + `billing-view.tsx` — all real queries | Credit reset date is subject to the staleness bug in §3 |
| 37/38 | Pricing page correct, and identical price source as checkout (no drift possible) | PASS | Both `pricing-section.tsx:35` and `paystack-provider.ts:66` call the same `priceForInterval()` from the same module | |
| 39/40 | Env/secret hygiene — no real secrets committed, server-only, never in client bundle | PASS | `.env.example` placeholders only; every `PAYSTACK_SECRET_KEY`/`PAYSTACK_WEBHOOK_SECRET` usage confirmed server-only; `.env.local` is gitignored and untracked | This sandbox's own `.env.local` holds real Supabase/OpenAI credentials in plaintext — not a repo defect (correctly gitignored) but noted as a standing operational fact |
| 41/42 | Database schema sound; RLS prevents cross-account access to subscriptions/credits/ledger/billing_events | PASS (cross-account) / **FAIL (self-service over-permission)** | Cross-account isolation is real and live-tested (`07_billing_test.sql`, fresh "Carol" stranger account gets 0 rows). But see Security Findings §1 — the *same account's own* over-broad UPDATE privilege is the actual hole, which is a different axis than cross-account leakage and was not caught by the existing test suite because it only tests horizontal (other-user) access | |
| 43 | Automated test coverage for the scenarios the spec lists | PARTIAL | 144/144 vitest pass, SQL suite runs clean — see the coverage table below for exactly which named scenarios are/aren't directly tested | |
| 44/45 | Live Paystack verification | NOT VERIFIABLE LIVE | No network path to `api.paystack.co` or to the real Supabase project from either environment this session has access to (confirmed via failed `curl`) | Correctly *not* claimed as PASS anywhere in the prior completion report either |

### Test scenario coverage (item 43, itemized per the audit spec's explicit list)

| Scenario | Verdict | Evidence |
|---|---|---|
| Pricing calculations | PASS | `lib/billing/plans.test.ts` — recomputes discount math independently |
| Plan entitlements | PASS | `plans.test.ts` | |
| AI credit math | PASS | `credit-costs.test.ts` | |
| Failed AI request doesn't consume a credit | PARTIAL | True by code inspection (see item 12); no automated test exercises "AI call throws → credit balance unchanged" |
| Concurrent credit usage | PARTIAL | Real row-lock exists and is exercised sequentially; no genuine two-connection race test |
| Subscription activation | PARTIAL | `apply_plan_change` owner-authorization is SQL-tested; `activatePaidPlanFromPayment`'s combined subscription+credit-reset+lock behavior has no dedicated test |
| Webhook duplicates | PARTIAL | DB-level unique constraint is real and correct; no test inserts a duplicate `provider_event_id` and asserts the second call is a no-op |
| Invalid webhook signatures | PARTIAL | Unit-tested thoroughly at the crypto-function level (`paystack-client.test.ts`, 9 cases incl. the timing-safe-equal branch); **not** tested at the actual route-handler level (no test POSTs a bad signature to `/api/webhooks/paystack` and checks for 401 + no side effects) |
| Unauthorized billing access | PASS | `07_billing_test.sql` — cross-account (Carol) and same-workspace-non-owner (Bob) both live-tested | Does not cover the self-service over-permission issue (different axis, see above) |
| Upgrade/downgrade flows | PARTIAL | No test asserts the full downgrade math (e.g. Pro 8 brands → Creator 3-brand limit → exactly 3 unlocked / 5 locked) |
| Free transition | FAIL | Zero test coverage, JS or SQL, of `getResolvedSubscription`'s lazy cancel→Free transition |

## D. Security Findings

### CRITICAL

**§1 — Any authenticated user can self-grant any plan, any AI credit allocation, and any billing period, with zero payment, by calling the database directly — bypassing the entire Next.js app, entitlements, and Paystack.**

This was reproduced live against a scratch Postgres instance seeded from the actual migration files (not simulated or inferred). Two independent, equally direct paths exist:

1. **Direct table write.** `subscriptions` has an `UPDATE` RLS policy (`0009...sql / subscriptions_update_owner`) gated only by `is_billing_owner(owner_id)` — i.e. "is this your own row" — with no restriction on *which columns or values* can be set. Supabase's standard project bootstrap (mirrored exactly in this repo's own `supabase/tests/00_bootstrap_auth_sim.sql:46`, `grant all on all tables in schema public to anon, authenticated, service_role`) grants the base `UPDATE` privilege broadly; RLS is the only gate, and this particular policy doesn't narrow it. A signed-in user's own Supabase client (using only the public anon key + their own session — the same credentials every page in the app already hands the browser) can issue:
   ```
   PATCH /rest/v1/subscriptions?owner_id=eq.<their-own-id>
   { "plan_id": "pro", "status": "active", "current_period_end": "2126-01-01T00:00:00Z" }
   ```
   and it succeeds. No RPC needed at all.

2. **Direct RPC call.** Even if (1) were closed, `apply_plan_change(p_owner_id, p_plan_id, p_status, p_billing_interval, p_period_start, p_period_end, p_cancel_at_period_end, p_credit_allocation)` (`0008...sql:271-311`) is a `SECURITY DEFINER` function granted `EXECUTE` to `authenticated` (`0008...sql:311`), and its only check is the same `is_billing_owner`. It accepts `p_plan_id` and `p_credit_allocation` as independent, uncorrelated parameters — nothing inside the function validates that a `p_credit_allocation` of, say, 999999999 is consistent with the actual "Pro" plan's real allowance of 260. Reachable identically via `POST /rest/v1/rpc/apply_plan_change`.

The application code itself is correct — `lib/billing/paystack-provider.ts` and `services/billing-service.ts` always resolve price/credits from `lib/billing/plans.ts` server-side and never accept them from the client. The problem is that Supabase auto-publishes every `public`-schema table and `SECURITY DEFINER` function granted to `authenticated` via PostgREST, so the correct app-layer code is trivially bypassable by anyone who calls the database directly instead of going through the Next.js app — which any browser already has the credentials to do.

**Related, same-root-cause issue found during my own follow-up verification (not flagged by name by the subagents, but the same class of bug):** `workspaces` has an `UPDATE` policy (`workspaces_update_editor`, from the pre-existing migration `0003_rls_policies.sql:43-44`) scoped only by workspace-editor membership, with no column restriction. Phase 7.5 added the `billing_locked` column to this already-broadly-writable table without carving out protection for it — meaning any editor of a downgrade-locked workspace can directly `PATCH` `billing_locked: false` on their own workspace via PostgREST, self-reversing a downgrade lock with no server-side involvement at all.

### HIGH

**§2 — Downgrade-locked workspaces are not consistently blocked from new content creation, at either the RLS or the application layer.**

`billing_locked` is checked inside `lib/billing/entitlements.ts`'s `canCreatePillar`, `canCreateCalendar`, `canCreateIdea`, and `canUseAI` — but:
- **RLS never references `billing_locked` at all** — a repo-wide grep for the column name inside any RLS policy in `supabase/migrations/` returns zero hits. The `content_pillars`/`content_calendars`/`content_ideas`/`calendar_posts` insert policies (`0003_rls_policies.sql`) only check `is_workspace_editor(workspace_id)`. Any editor of a locked workspace can insert directly via PostgREST, bypassing every app-layer entitlement check.
- **`canCreateStrategy` is dead code** (confirmed zero call sites) — strategy/pillar saves (`createStrategyAction`, `saveGeneratedStrategyAction` in `app/app/(shell)/strategy/actions.ts`) call `saveStrategy()` with no lock check of any kind.
- **No entitlement function for individual post creation exists at all.** `createPostAction`, `duplicatePostAction`, `saveGeneratedCalendarAction` (bulk post insert), and `addIdeaToCalendarAction` (`app/app/(shell)/calendars/actions.ts`, `app/app/(shell)/ideas/actions.ts`) call their underlying create/duplicate functions with zero entitlement or lock check.

Net effect: a user downgraded to Free with a locked workspace can still, through the normal app UI (no "attack" required), save new strategies/pillars and add unlimited new posts to that workspace's existing calendars.

**§3 — The AI-credit balance and reset date shown on the Billing page and Dashboard can be stale.**

`getCreditBalance()` (`services/billing-service.ts:22-26`) is a plain `select *` with no period-rollover logic — it is the only source of what `CreditMeter` renders on both the Billing page and Dashboard. The lazy monthly rollover exists *only* inside `consume_ai_credits`, reached only when an AI action is actually attempted. A user who hasn't triggered any AI generation since their period elapsed will see the previous period's `credits_used`/`monthly_allocation` and an already-past `period_end` date, until they either perform an AI action or change plans. This reproduces on the first billing-page view of any billing cycle for a user who hasn't yet used AI that period — not an edge case.

### MEDIUM

- `canCreateStrategy` is defined but entirely unreachable dead code (contributory cause of §2).
- Check-then-insert for workspace-count limit (`canCreateBrand` → `createWorkspace`) isn't atomic; a very tight double-submit race could create one workspace past the plan limit. Low real-world impact (self-corrects on the next downgrade-lock pass), but worth a follow-up.
- No test exercises the full downgrade lock/unlock math, the free-transition lazy-resolution function, webhook duplicate-delivery idempotency, or an invalid signature hitting the actual route handler (as opposed to the underlying crypto function, which is well tested).
- Neither payment-activation path (webhook or verify-on-return) re-validates that the amount actually paid matches the plan/interval's price before activating — currently safe only because Paystack's hosted checkout fixes the amount server-side at initialize and metadata isn't client-writable, but there's no independent re-check at the point of activation.

### LOW

- `pricing-faq.tsx` and `pricing-section.tsx`'s `FEATURE_LINES` hardcode credit/limit numbers in prose rather than deriving them from `PLANS` — a future price/limit change wouldn't propagate to this copy automatically.
- `types/database.ts` hand-redeclares `PlanId`/`BillingInterval` as string-literal types rather than importing from `lib/billing/plans.ts` — type-only duplication, no runtime effect today.
- `ai_usage_ledger.request_status`'s `'failed'` value is defined in the check constraint but no code path ever writes it — the ledger only ever logs successful spends (which is arguably correct given spec §12, but the column's "failed" branch is currently unreachable/dead).

## E. Required Corrections

Only genuinely required items, in priority order:

1. **[CRITICAL]** Close the direct-database-access price/credit-authority bypass: restrict `subscriptions` and `workspaces` UPDATE privileges to specific self-service columns only (`cancel_at_period_end`; and the ordinary editable workspace fields, excluding `billing_locked`), and make `apply_plan_change` callable only by the service role (never `authenticated`/`anon`/`public`), routing all plan-activation writes through the admin client from trusted server code. Remove `consume_ai_credits`'s caller-supplied `p_plan_allocation` parameter and derive the allocation from the account's actual stored `plan_id` inside the function itself.
2. **[HIGH]** Add `billing_locked` checks to strategy save, individual/duplicate post creation, and idea-to-calendar — both at the RLS policy level (defense in depth, since app-layer checks alone are bypassable the same way §1 was) and by wiring `canCreateStrategy` in or adding an equivalent check for posts.
3. **[HIGH]** Make `getCreditBalance()` (or its callers) perform the same lazy period-rollover `consume_ai_credits` does, so the Billing page and Dashboard never display a stale, already-elapsed period.
4. **[MEDIUM, recommended but not blocking]** Add the missing test coverage identified in the matrix above (failed-request no-charge, duplicate webhook, route-level invalid signature, full downgrade math, free-transition resolution).

## F. Live Testing Requirements

```text
CODE CORRECTIONS REQUIRED:
Items 1-3 in section E above (CRITICAL + 2×HIGH).

CODE APPEARS CORRECT BUT REQUIRES LIVE PAYSTACK VERIFICATION:
- Every checkout amount/plan-code pairing (6 combinations) actually reaching Paystack's hosted page with the right price.
- A real webhook delivery from Paystack (this repo's signature-verification and idempotency logic is unit- and logic-verified, but has never received an actual Paystack-signed payload).
- The verify-on-return path against a real completed transaction.
- Payment-failure and cancellation webhook events from a real Paystack test account.
None of these are achievable from this session's environment — no network path exists to api.paystack.co or to the project's real Supabase instance from either the cloud sandbox or the linked local machine's isolated shell used in this session.
```

---

## Corrections Applied (this session, after the findings above were confirmed)

Given the CRITICAL and both HIGH findings were clear-cut, well-understood, and left the application genuinely exploitable, they were fixed in this same session immediately after this audit's findings were confirmed. This section documents exactly what changed; the findings above remain unedited, as the honest "before" record.

**1. CRITICAL — price/credit-authority bypass (Security Findings §1). Fixed by `supabase/migrations/0010_billing_price_authority_fix.sql`:**
- `subscriptions`: broad `UPDATE` revoked from `public`/`anon`/`authenticated`; only `cancel_at_period_end` is column-grant-writable by `authenticated` now. Every other column (`plan_id`, `status`, `current_period_end`, etc.) is unreachable by direct table write.
- `workspaces`: same treatment — `billing_locked` excluded from the column-level `UPDATE` grant to `authenticated`; the ordinary self-service fields (`name`, `description`, `industry`, `website`, `primary_market`, `onboarding_step`, `onboarding_completed`) remain writable.
- `apply_plan_change()`: `EXECUTE` revoked from `public`/`anon`/`authenticated`, granted to `service_role` only. All call sites (`lib/billing/provider.ts`'s `ManualBillingProvider.changePlan`, `lib/billing/paystack-provider.ts`'s `PaystackBillingProvider.changePlan`) now build a `createAdminClient()` internally rather than using the caller's session client.
- `consume_ai_credits()`: the caller-supplied `p_plan_allocation` parameter was removed entirely (3-arg signature now: `p_workspace_id, p_action_type, p_credits`). The function resolves the account's real allocation itself from `subscriptions.plan_id` via a hardcoded `case` (10/85/260 — intentionally duplicated from `lib/billing/plans.ts` as DB-layer defense-in-depth; both are commented to be kept in sync).
- TypeScript call sites updated to match: `types/database.ts`, `services/billing-service.ts` (`checkAiCredits`/`consumeAiCredits` no longer send an allocation; `applyPlanChange`/`lockExcessWorkspaces` doc comments now state ADMIN-CLIENT-ONLY), `app/app/(shell)/settings/billing/actions.ts` (`setActiveWorkspacesAction` now calls `setActiveWorkspaces` with `createAdminClient()`).
- New test coverage: `supabase/tests/07_billing_test.sql`'s "SELF-ESCALATION" section — the real account owner, calling as `authenticated`, now gets a permission-denied error attempting to directly write `subscriptions.plan_id`, `subscriptions.current_period_end`, any `credit_balances` column, or `workspaces.billing_locked`, while her legitimate self-service writes (`cancel_at_period_end`, `workspaces.name`) still succeed; and calling `apply_plan_change` directly now errors for both the account owner and a third party, succeeding only via `set role service_role`.
- Also fixed the related, previously-unflagged variant found during audit follow-up: `workspaces_update_editor`'s missing column restriction on `billing_locked` (a self-unlock path), closed by the same `workspaces` column-grant change above.

**2. HIGH — locked-workspace enforcement gaps (Security Findings §2). Fixed at both layers:**
- **RLS (defense in depth):** new `supabase/migrations/0011_locked_workspace_insert_guard.sql` adds a reusable `is_workspace_open_for_writes()` helper (`is_workspace_editor()` AND NOT `billing_locked`) and rewrites the `INSERT` policies for `content_strategies`, `content_pillars`, `content_calendars`, `calendar_posts`, and `content_ideas` to use it. `UPDATE`/`DELETE` policies are untouched by design — a locked workspace's existing content stays editable; only *new* content is blocked, matching the product's downgrade-grace design (spec §27-28).
- **App layer:** `lib/billing/entitlements.ts` gained `isWorkspaceLocked()`, a lightweight locked-flag check for write paths with no dedicated numeric limit. `canCreateStrategy` (previously dead code with zero call sites) is now wired into `createStrategyAction` and `saveGeneratedStrategyAction` (`app/app/(shell)/strategy/actions.ts`). Equivalent checks were added to `createPostAction`, `duplicatePostAction`, and `saveGeneratedCalendarAction` (`app/app/(shell)/calendars/actions.ts`) and to `addIdeaToCalendarAction` (`app/app/(shell)/ideas/actions.ts`), each resolving the calendar's `workspace_id` first and returning a clear user-facing message before the RLS layer would otherwise raise a raw error.
- New test coverage: `07_billing_test.sql`'s "LOCKED WORKSPACE" section seeds a pre-existing strategy and calendar, locks the workspace, confirms all five insert paths error out for the workspace's own owner/editor with zero rows landing, then unlocks and confirms all five succeed — proving the block is specific to the lock, not a general RLS regression.

**3. HIGH — stale credit balance on read (Security Findings §3). Fixed by `supabase/migrations/0012_credit_balance_lazy_rollover.sql`:**
- New `get_credit_balance(p_owner_id)` RPC performs the identical lazy period-rollover `consume_ai_credits()` does (same plan-allocation `case`, documented as the same intentional duplication) but only takes a row lock and writes when the period has actually elapsed — an ordinary read stays a cheap, lock-free `SELECT` in the common case. Authorization reuses the existing `can_view_billing()` helper (owner or workspace member), matching the table's own `SELECT` RLS policy.
- `services/billing-service.ts`'s `getCreditBalance()` now calls this RPC instead of reading the table directly, so both callers (`app/app/(shell)/settings/billing/page.tsx`, `app/app/(shell)/dashboard/page.tsx`) always see a current period.
- New test coverage: `07_billing_test.sql`'s "get_credit_balance lazy rollover" section verifies a no-op read when the period hasn't elapsed, an authorization error for a non-member stranger, and a correct rollover (new allocation from the current plan, `credits_used` reset, period pushed forward) triggered by a workspace member's read — not just the owner's.

**Test-harness bug found and fixed along the way:** `supabase/tests/run.sh` re-ran `00_bootstrap_auth_sim.sql`'s blanket `grant all on all tables in schema public to authenticated` *after* applying migration 0010, which silently re-broadened `authenticated`'s access and would have made every self-escalation test above pass for the wrong reason (or rather, fail to catch the bug at all). Fixed by moving that re-grant to run before 0010+ migrations rather than after, so a privilege-narrowing migration is always the final word in the harness — matching real Supabase, where this bootstrap step doesn't exist at all and migrations simply apply in order.

**Re-verification (this session, after all three fixes):** `npx tsc --noEmit` (clean), `npm run lint` (0 errors, 2 pre-existing-pattern warnings for intentionally-unused `_planId` parameters kept for call-site convenience), `npx vitest run` (144/144 passing, unchanged), `npm run build` (successful production build, all 24 routes), and `bash supabase/tests/run.sh` (all of scripts 02–07 passing against migrations 0001–0012, including the new self-escalation, locked-workspace, and credit-rollover assertions above).

**Explicitly not fixed in this pass (scope boundary, not an oversight):** the MEDIUM/LOW findings from Section D — the `pricing-faq.tsx`/`types/database.ts` prose/type duplication, missing test coverage for duplicate-webhook/route-level-invalid-signature/full-downgrade-math/free-transition scenarios, and no amount-revalidation at payment activation — remain open, as does all live Paystack verification (Section F), which is not achievable from this environment regardless.

## Sign-off

```text
PHASE 7.5 AUDIT COMPLETE
IMPLEMENTATION:
PARTIAL (as found) — CRITICAL + both HIGH findings corrected in this session (see Corrections Applied); MEDIUM/LOW items remain open by explicit scope decision
SECURITY:
ISSUES FOUND, THEN CORRECTED — 1 CRITICAL, 2 HIGH found and fixed with new regression coverage in this session; MEDIUM/LOW items remain open
LIVE PAYSTACK VERIFICATION:
PENDING — not achievable from this environment; unchanged by the corrections above
FINAL STATUS:
PROVISIONAL SIGN-OFF — the CRITICAL and HIGH findings that blocked sign-off as found are corrected and re-verified by an expanded automated regression suite in this same session; this remains provisional (not FULL SIGN-OFF) because (a) the fixes were verified by the same session that audited and built the feature, not a genuinely independent third party, and (b) live Paystack verification per Section F has not been performed. FULL SIGN-OFF requires both a true independent re-review and the live-testing checklist in Section F.
```
