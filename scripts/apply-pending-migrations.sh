#!/usr/bin/env bash
# Applies the Supabase migrations that are NOT yet in your database (0023 -> 0028), in order, each in its own
# transaction. Safe to re-run: every migration has a "already applied?" probe and is skipped if so, and a
# failing migration rolls back completely and stops the script.
#
# Usage (from the repo root, in your Mac terminal):
#     bash scripts/apply-pending-migrations.sh
# It asks for your Supabase DATABASE password (Dashboard -> Project Settings -> Database; "Reset database
# password" there if you don't have it). It is read silently and never written to disk.
#
# Needs `psql`:  brew install libpq && brew link --force libpq
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-$(tr -d '[:space:]' < supabase/.temp/project-ref 2>/dev/null || true)}"
POOLER_HOST="${SUPABASE_POOLER_HOST:-aws-1-eu-west-1.pooler.supabase.com}"
MIGRATIONS_DIR="supabase/migrations"

# PSQL_CMD can be overridden (used by the automated test of this script); otherwise connect to Supabase.
if [[ -z "${PSQL_CMD:-}" ]]; then
  command -v psql >/dev/null 2>&1 || { echo "psql not found. Install it with:  brew install libpq && brew link --force libpq"; exit 1; }
  [[ -n "$PROJECT_REF" ]] || { echo "Could not determine the project ref (supabase/.temp/project-ref). Set SUPABASE_PROJECT_REF."; exit 1; }
  if [[ -z "${PGPASSWORD:-}" ]]; then
    read -r -s -p "Supabase database password: " PGPASSWORD; echo
    export PGPASSWORD
  fi
  # Connection settings go in PG* environment variables (not a conninfo string) so nothing gets split by the shell.
  # The Supabase pooler identifies your project from the "postgres.<project-ref>" user name.
  export PGHOST="$POOLER_HOST" PGPORT=5432 PGDATABASE=postgres PGUSER="postgres.$PROJECT_REF" PGSSLMODE=require
  PSQL_CMD="psql"
fi

run() { $PSQL_CMD -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "Checking connection..."
run -tAc "select 'connected to ' || current_database() || ' as ' || current_user" 

# file | SQL that returns 't' when that migration is already applied
MIGRATIONS=(
  "0023_notifications.sql|select to_regclass('public.notification_log') is not null"
  "0024_stripe_schema_prep.sql|select exists (select 1 from pg_constraint where conname = 'subscriptions_provider_check' and pg_get_constraintdef(oid) like '%stripe%')"
  "0025_idea_multi_platform.sql|select exists (select 1 from information_schema.columns where table_schema='public' and table_name='content_ideas' and column_name='recommended_platforms')"
  "0026_support_chat.sql|select to_regclass('public.support_chats') is not null"
  "0027_security_hardening.sql|select to_regclass('public.rate_limits') is not null"
  "0028_ai_credit_reservations.sql|select to_regprocedure('public.reserve_ai_credits(uuid,text,integer)') is not null"
)

applied=0
for entry in "${MIGRATIONS[@]}"; do
  file="${entry%%|*}"; probe="${entry#*|}"
  if [[ "$(run -tAc "$probe")" == "t" ]]; then
    echo "  skip   $file (already applied)"
    continue
  fi
  echo "  apply  $file"
  run --single-transaction -f "$MIGRATIONS_DIR/$file"
  applied=$((applied + 1))
done
echo "Applied $applied migration(s)."

echo
echo "Verifying the security fixes..."
run -tA <<'SQL'
select case when not has_function_privilege('anon', 'public.resolve_scheduled_plan_change(uuid,text,text,timestamptz,timestamptz,integer,text,text)', 'execute')
             and not has_function_privilege('authenticated', 'public.resolve_scheduled_plan_change(uuid,text,text,timestamptz,timestamptz,integer,text,text)', 'execute')
             and not has_function_privilege('authenticated', 'public.mark_subscription_past_due(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.set_subscription_pending_change(uuid,boolean,text,text)', 'execute')
            then 'PASS  billing RPCs are service_role only' else 'FAIL  billing RPCs are still callable by clients' end;
select case when has_function_privilege('authenticated', 'public.reserve_ai_credits(uuid,text,integer)', 'execute')
             and not has_function_privilege('authenticated', 'public.settle_ai_credits(uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.refund_ai_credits(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.reserve_ai_credits(uuid,text,integer)', 'execute')
            then 'PASS  credit reservation permissions are correct' else 'FAIL  credit reservation permissions are wrong' end;
select case when not has_table_privilege('authenticated', 'public.rate_limits', 'select')
            then 'PASS  rate_limits is not readable by clients' else 'FAIL  rate_limits is readable by clients' end;
select case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                              where n.nspname='public' and p.prosecdef and p.prokind='f'
                                and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'))
            then 'PASS  every SECURITY DEFINER function has a pinned search_path' else 'FAIL  some SECURITY DEFINER functions lack a pinned search_path' end;
SQL
echo "Done."
