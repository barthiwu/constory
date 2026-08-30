#!/usr/bin/env bash
# Applies every migration in supabase/migrations/ to a scratch local Postgres
# database, then runs the numbered test scripts in this directory against it.
# See README.md for what each script verifies and why this exists.
set -euo pipefail

DB_NAME="${CONSTORY_TEST_DB:-constory_test}"
PSQL_SUPERUSER="${CONSTORY_TEST_PG_SUPERUSER:-postgres}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations" && pwd)"

run_psql() {
  PGOPTIONS='--client-min-messages=warning' sudo -u "$PSQL_SUPERUSER" psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$1"
}

echo "== Recreating scratch database: $DB_NAME =="
sudo -u "$PSQL_SUPERUSER" psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB_NAME;"
sudo -u "$PSQL_SUPERUSER" psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DB_NAME;"

echo "== Bootstrapping auth simulation (migration 0001 references auth.users) =="
run_psql "$SCRIPT_DIR/00_bootstrap_auth_sim.sql"

echo "== Applying core migrations 0001-0004 =="
for f in "$MIGRATIONS_DIR"/0001_*.sql "$MIGRATIONS_DIR"/0002_*.sql "$MIGRATIONS_DIR"/0003_*.sql "$MIGRATIONS_DIR"/0004_*.sql; do
  echo "  -> $(basename "$f")"
  run_psql "$f"
done

echo "== Re-granting privileges on tables created by migrations =="
run_psql "$SCRIPT_DIR/00_bootstrap_auth_sim.sql"

echo "== Seeding users =="
run_psql "$SCRIPT_DIR/01_seed_users.sql"

echo "== Inserting legacy (pre-migration-0005) workspace fixture =="
run_psql "$SCRIPT_DIR/01b_legacy_workspace_fixture.sql"

echo "== Applying migration 0005 (onboarding progress) =="
run_psql "$MIGRATIONS_DIR"/0005_*.sql

echo "== Applying migrations 0006-0009 (creates Phase 7.5 tables) =="
shopt -s nullglob
for f in "$MIGRATIONS_DIR"/000[6-9]_*.sql; do
  echo "  -> $(basename "$f")"
  run_psql "$f"
done
shopt -u nullglob

echo "== Re-granting privileges again for any tables created by 0005-0009 (e.g. Phase 7.5's subscriptions/credit_balances/ai_usage_ledger) =="
run_psql "$SCRIPT_DIR/00_bootstrap_auth_sim.sql"

# IMPORTANT: 0010+ must run AFTER the broad re-grant above, not before it.
# 00_bootstrap_auth_sim.sql's `grant all on all tables in schema public` is a
# blanket grant that exists only to simulate PostgREST's baseline table
# exposure in this local harness — real Supabase never re-issues it between
# migrations. Migration 0010 intentionally REVOKEs that broad UPDATE and
# replaces it with column-level grants (PHASE7_5_AUDIT_REPORT.md Security
# Findings §1); running the blanket re-grant after 0010 would silently
# re-broaden `authenticated`'s access and defeat the fix without any test
# failure to show for it. Keep any future privilege-narrowing migration in
# this later loop too, not the one above.
echo "== Applying remaining migrations (0010+) =="
shopt -s nullglob
for f in "$MIGRATIONS_DIR"/00[1-9][0-9]_*.sql; do
  echo "  -> $(basename "$f")"
  run_psql "$f"
done
shopt -u nullglob

for f in "$SCRIPT_DIR"/0[2-9]_*.sql; do
  echo ""
  echo "############################################################"
  echo "## $(basename "$f")"
  echo "############################################################"
  run_psql "$f"
done

echo ""
echo "== Done. Review the \\echo lines above against their stated expectations. =="
