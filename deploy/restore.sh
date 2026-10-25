#!/usr/bin/env bash
# Restore a MmiriOma backup into a database (NFR-014, NFR-033).
#
# Replaces every object the backup contains in the TARGET database. Test it on
# a scratch database first (the pilot's restore test, G9); restore over
# production only to recover from a failed release or data loss, and record it
# in docs/log/. Deletion requests made after the backup must be re-applied
# afterwards (privacy notice, section 10).
#
# Usage:
#   RESTORE_DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/DB' \
#     deploy/restore.sh path/to/mmirioma-YYYYMMDDTHHMMSSZ.dump --yes
#
# Settings (environment):
#   RESTORE_DATABASE_URL   required; postgresql+asyncpg:// is accepted
#   BACKUP_USE_DOCKER=1    run the clients from the postgis/postgis:16-3.4 image
#   BACKUP_DOCKER_NETWORK  Docker network for that container (local tests)
set -euo pipefail

file="${1:?Give the backup file to restore}"
[[ "${2:-}" == "--yes" ]] || {
  echo "This replaces the data in RESTORE_DATABASE_URL. Re-run with --yes to continue." >&2
  exit 2
}
[[ -f "$file" ]] || { echo "No such file: $file" >&2; exit 2; }
url="${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL (never commit it)}"
url="${url/postgresql+asyncpg:\/\//postgresql://}"
image="postgis/postgis:16-3.4"
dir="$(cd "$(dirname "$file")" && pwd)"
# Git Bash on Windows: Docker needs the Windows form of the folder (pwd -W).
mount_dir="$(cd "$dir" && (pwd -W 2>/dev/null || pwd))"
name="$(basename "$file")"

pg() {
  if [[ "${BACKUP_USE_DOCKER:-0}" == "1" ]]; then
    local network=()
    [[ -n "${BACKUP_DOCKER_NETWORK:-}" ]] && network=(--network "$BACKUP_DOCKER_NETWORK")
    MSYS_NO_PATHCONV=1 docker run --rm -i "${network[@]}" -v "$mount_dir:/backups" "$image" "$@"
  else
    "$@"
  fi
}

if [[ "${BACKUP_USE_DOCKER:-0}" == "1" ]]; then source="/backups/$name"; else source="$dir/$name"; fi

# --clean --if-exists: drop what the backup holds before re-creating it, so a
# restore over an existing schema works; --exit-on-error: stop at the first
# problem instead of leaving a half-restored database without saying so.
pg pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
  --dbname="$url" "$source"

# What came back: the schema revision and a few row counts to compare with the
# source (the restore test records them).
pg psql "$url" --no-psqlrc --tuples-only --command \
  "SELECT 'alembic_version ' || version_num FROM alembic_version
   UNION ALL SELECT 'users ' || count(*) FROM users
   UNION ALL SELECT 'orders ' || count(*) FROM orders
   UNION ALL SELECT 'order_events ' || count(*) FROM order_events
   UNION ALL SELECT 'cash_collections ' || count(*) FROM cash_collections
   UNION ALL SELECT 'audit_logs ' || count(*) FROM audit_logs;"
echo "Restored $name"
