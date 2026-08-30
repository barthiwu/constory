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

echo "== Applying migrations 0001-0004 =="
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

for f in "$SCRIPT_DIR"/0[2-9]_*.sql; do
  echo ""
  echo "############################################################"
  echo "## $(basename "$f")"
  echo "############################################################"
  run_psql "$f"
done

echo ""
echo "== Done. Review the \\echo lines above against their stated expectations. =="
