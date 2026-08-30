# Constory — Phase 1–3 Correction & Completion Report

Commit: `34b38ee` on `main` — pushed to `github.com/barthiwu/constory`, on top of the existing history (no rewrite).

## 1. Fixes completed

- **`.env.example`** — already existed with the exact required variables and safe placeholders, but was never actually committed: `.gitignore`'s `.env*` pattern silently excluded it too. Added a `!.env.example` exception so it's tracked going forward, and it's now committed.
- **Post-login redirect restoration** — `loginAction` now accepts a `redirectTo` and validates it server-side (`lib/redirect.ts`) against an allowlist: only same-origin `/app/...` paths are accepted; absolute URLs, protocol-relative URLs (`//evil.com`), backslash tricks, and anything containing `://` fall back to `/app/dashboard`. The login form now reads `redirectTo` from the query string and passes it through. The proxy now preserves the full path + query string (previously only the bare path) when it redirects an unauthenticated `/app/*` visit to `/login`. Also fixed a dead-code condition in the proxy that was supposed to redirect an already-logged-in user away from `/login`/`/signup` but could never actually fire.
- **Workspace-switch authorization (defense in depth)** — `switchWorkspace`/`switchWorkspaceAction` now explicitly checks authentication and an actual `workspace_members` row for that user before writing the active-workspace cookie, instead of trusting the caller. On failure, nothing is mutated and a safe error is returned; the workspace switcher UI now surfaces that error instead of assuming success.
- **True onboarding persistence** — workspaces gained `onboarding_step` / `onboarding_completed` columns. The onboarding page now loads the user's in-progress workspace, brand profile, and products server-side and resumes the wizard at the correct step; every step's fields are saved to the database as the user completes it (not just at the very end), so progress survives a refresh, logout/login, or the browser closing. The authenticated app shell now gates on `onboarding_completed`, not merely "a workspace exists," so an incomplete workspace correctly routes back to onboarding.
- **Idempotent products/services** — products now persist immediately with stable, server-issued ids via real create/update/delete calls as the user adds/edits/removes them in the wizard, instead of living only in local state and being batch-recreated on final submit (the old source of duplicate-on-resume risk). The same fix improved the existing Brand settings page, which previously did a full `window.location.reload()` after adding a product; it now updates in place.

## 2. Files changed

**New:**
`lib/redirect.ts`, `lib/redirect.test.ts`, `lib/validations/auth.test.ts`, `services/workspace-service.test.ts`, `vitest.config.ts`, `supabase/migrations/0005_onboarding_progress.sql`, `supabase/tests/` (9 files — bootstrap, seed, legacy-workspace fixture, 4 test scripts, README, runner script).

**Modified:** `.gitignore`, `README.md`, `app/(auth)/actions.ts`, `app/app/(shell)/brand/actions.ts`, `app/app/(shell)/layout.tsx`, `app/app/actions.ts`, `app/app/onboarding/actions.ts`, `app/app/onboarding/page.tsx`, `app/app/page.tsx`, `components/auth/login-form.tsx`, `components/brand/products-section.tsx`, `components/layout/workspace-switcher.tsx`, `components/onboarding/onboarding-wizard.tsx`, `components/onboarding/steps.tsx`, `lib/supabase/proxy.ts`, `services/workspace-service.ts`, `types/database.ts`, `package.json`/`package-lock.json` (added `vitest`).

## 3. Database changes

- **Migration `0005_onboarding_progress.sql`**: adds `workspaces.onboarding_step integer not null default 0` (check constraint 0–7) and `workspaces.onboarding_completed boolean not null default false`. Includes a backfill: any workspace that already has a brand profile with real content is marked `onboarding_completed = true` on migration, so existing users are never sent back into the wizard by this change (verified in `supabase/tests/05_onboarding_progress_test.sql`).
- No RLS policies were changed. The new columns are covered by the existing `workspaces` policies (member can select, editor can update), which the test suite confirms still correctly blocks a non-member from reading or writing another workspace's onboarding progress.
- No new functions/triggers.

## 4. Tests added

All committed and reproducible — not one-off manual checks:

- **`supabase/tests/`** (`npm run test:db`): runs the real migrations against a local Postgres simulation of Supabase's `auth` schema (this sandbox has no network path to `*.supabase.co`, so this is the rigorous, reproducible substitute — see the suite's README for why and how to also verify against a real project). Covers:
  - The full two-user cross-workspace matrix (User A/Workspace A vs. User B/Workspace B): B cannot read or write A's workspace, brand profile, products/services, strategy, pillars, calendars, calendar posts, ideas, or AI-generation records — verified by direct `SELECT`/`UPDATE`/`DELETE`/`INSERT` attempts, not by trusting the app layer.
  - Viewer-role read-only enforcement.
  - Privilege-escalation prevention: a non-owner member cannot update their own `workspace_members` row to `owner`/`admin`.
  - Onboarding-progress defaults, the step-range constraint, non-member access denial, and the pre-existing-workspace backfill.
  - **All scripts run clean against the current schema** (last run: exit 0, every labeled expectation matched — see the suite output).
- **Vitest unit tests** (`npm test`, 30 tests, all passing):
  - `lib/redirect.test.ts` — the open-redirect allowlist: accepts safe `/app/...` paths (including nested paths + query strings), rejects absolute URLs, protocol-relative URLs, backslash tricks, out-of-area paths, and embedded control characters; respects a custom fallback.
  - `lib/validations/auth.test.ts` — valid/invalid signup (email, name, password strength, password match), login, forgot-password, and reset-password validation.
  - `services/workspace-service.test.ts` — the workspace-switch defense-in-depth logic against a mocked Supabase client: confirms the cookie is never written when the membership check fails, and is written when it succeeds.

**Not automated in this round** (see Remaining limitations): full end-to-end auth flows (signup → email confirm → login → logout → forgot/reset password) against a real GoTrue instance, and browser-driven onboarding resume-after-logout testing, since this sandbox has no network path to a live Supabase project.

## 5. Commands run

```bash
npm install                 # picks up vitest
npm run dev                 # local dev server
npm run build                # production build — succeeds
npm run lint                 # eslint — clean
npx tsc --noEmit -p tsconfig.json   # typecheck — clean
npm test                     # vitest — 30/30 passing
npm run test:db              # supabase/tests/run.sh — all expectations matched
```

## 6. Remaining limitations

- **No live Supabase/GoTrue verification.** This environment cannot reach `*.supabase.co` (network egress is blocked), so RLS and schema correctness were verified against a faithful local Postgres simulation of the `auth` schema and role model, not the real project. Before going live: run `supabase db push` against the real project and spot-check signup → email confirmation → login → the onboarding resume flow → cross-account access with two real accounts.
- **Brand voice on resume is not perfectly reconstructed.** The database stores brand voice as one flattened string (chips + free text joined at save time). On resume, the full saved value is shown in the free-text field rather than re-deriving which preset chips were originally selected — no data is lost, but the chip highlighting starts fresh.
- **Email-confirmation-required, expired-reset-link, and other GoTrue-specific edge cases are not covered by an automated test** in this round, for the same network-access reason above — they're documented as flows to verify manually against the real project (`supabase/tests/README.md` and this report both flag it).
- **AI features** (strategy/ideas/calendar/post generation) were left in place per instruction, not removed or newly approved. Verified (code review, not a new fix): `OPENAI_API_KEY` is read lazily only when an AI action actually runs, never at build/startup; the app builds and the core flows (auth, onboarding, brand, products) work fully without it; every AI-invoking action/route already catches configuration and API errors and returns a safe, generic message rather than crashing or leaking the key; the key is never imported into a Client Component. No behavior changes were made to the AI code itself.
- **No unrelated features were added.** This round only touched the five flagged corrections, their required tests, and the two directly-necessary side fixes (the `.env.example` gitignore gap, and the `ProductsSection` reload found while making product saves idempotent).
