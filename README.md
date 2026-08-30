# Constory

Constory turns a brand's basic information into a content strategy, content
pillars, ideas, and a postable content calendar — with optional AI generation
at each stage. It's built with Next.js (App Router), Supabase (Postgres +
Auth, secured with Row Level Security), and OpenAI.

## Requirements

- Node.js 20+
- A Supabase project (for Postgres + Auth)
- An OpenAI API key (optional — see [Running without OpenAI](#running-without-openai))

## Getting started

```bash
npm install
cp .env.example .env.local
# fill in .env.local with your own values — see "Environment variables" below
npm run dev
```

The app runs at http://localhost:3000.

### Environment variables

Copy `.env.example` to `.env.local` and fill in real values. **Never commit
`.env.local`** — it holds live secrets and is already covered by
`.gitignore`. `.env.example` itself must only ever contain placeholders.

| Variable | Required | Where to find it | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase dashboard → Project Settings → API | Public — safe to expose to the browser. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase dashboard → Project Settings → API | Public — safe to expose to the browser. This is the anon/publishable key, not the service-role key. |
| `SUPABASE_SECRET_KEY` | Yes | Supabase dashboard → Project Settings → API | **Server-only.** Never reference this from client components, and never prefix a secret with `NEXT_PUBLIC_`. |
| `OPENAI_API_KEY` | No | https://platform.openai.com/api-keys | **Server-only.** The app remains fully usable without it — see below. |
| `NEXT_PUBLIC_APP_URL` | Yes | — | Base URL used for auth redirect/email links. `http://localhost:3000` for local dev. |

### Database setup

Migrations live in `supabase/migrations/`, applied in numeric order. Against
a Supabase project:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This creates the schema, the `handle_new_user` / `handle_new_workspace`
triggers (auto-create a profile on signup, auto-add the creator as workspace
owner), and the Row Level Security policies that are the actual
authorization boundary for every workspace-scoped table — the application
code never relies on the frontend alone to enforce access control.

### Running without OpenAI

`OPENAI_API_KEY` is optional. Onboarding, brand profile, and products/services
management work fully without it. AI-powered strategy/ideas/calendar/post
generation is a separate, explicit action the user takes from within the app
(never triggered automatically), and every AI route fails safely with a clear
error message — not a crash — if the key isn't configured. The key is never
sent to the browser.

## Testing

```bash
npm test          # unit tests (redirect safety, validation schemas, workspace-membership logic)
npm run test:db   # database/RLS test suite against a local Postgres instance
```

See `supabase/tests/README.md` for what the database test suite covers (the
full two-user cross-workspace authorization matrix, viewer read-only
enforcement, privilege-escalation prevention, and onboarding-progress
persistence) and why it runs against a local Postgres simulation of
Supabase's `auth` schema rather than a live project.

## Project structure

```
app/(auth)/            Public auth pages: login, signup, forgot/reset password
app/app/onboarding/    Onboarding wizard (server-persisted, resumable)
app/app/(shell)/       Authenticated app: dashboard, brand, strategy, ideas, calendars, settings
app/api/ai/            AI generation endpoints (strategy, ideas, calendar, post)
components/            UI components, grouped by feature
services/               Data-access layer (one file per domain: workspace, brand, strategy, ...)
lib/                    Supabase clients, validation schemas, AI client, shared helpers
supabase/migrations/    SQL migrations (schema, triggers, RLS policies)
supabase/tests/         Reproducible database/RLS test scripts
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | Lint the codebase |
| `npm test` | Run unit tests |
| `npm run test:db` | Run the database/RLS test suite |
