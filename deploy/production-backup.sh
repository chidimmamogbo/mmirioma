#!/usr/bin/env bash
# Back up the production database (NFR-014): dump, check, prune, copy off the VPS.
#
# Reuses deploy/backup.sh, running pg_dump from the same PostGIS image on the
# stack's private "data" network, because the database publishes no port.
# Run it from cron or a systemd timer (docs/deployment/hostinger.md):
#   deploy/production-backup.sh
#
# Settings (in .env.production, or the environment):
#   BACKUP_DIR            folder on the VPS (default /var/backups/mmirioma)
#   BACKUP_KEEP_DAYS      delete older dumps here (default 30, the privacy notice)
#   BACKUP_RCLONE_REMOTE  off-VPS target as an rclone remote:path. PLACEHOLDER:
#                         unset means the backup stays on this VPS only, which
#                         does not survive losing the VPS, so the script warns.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${PROD_ENV_FILE:-$root/.env.production}"
[[ -f "$env_file" ]] || { echo "Missing $env_file" >&2; exit 1; }

# Read only the names this script needs, so the file is never executed as shell.
read_var() { grep -E "^$1=" "$env_file" | tail -n 1 | cut -d= -f2- || true; }
password="$(read_var POSTGRES_PASSWORD)"
[[ -n "$password" ]] || { echo "POSTGRES_PASSWORD is not set in $env_file" >&2; exit 1; }

dir="${BACKUP_DIR:-$(read_var BACKUP_DIR)}"; dir="${dir:-/var/backups/mmirioma}"
keep="${BACKUP_KEEP_DAYS:-$(read_var BACKUP_KEEP_DAYS)}"; keep="${keep:-30}"
remote="${BACKUP_RCLONE_REMOTE:-$(read_var BACKUP_RCLONE_REMOTE)}"

BACKUP_DATABASE_URL="postgresql://mmirioma:${password}@db:5432/mmirioma" \
BACKUP_USE_DOCKER=1 \
BACKUP_DOCKER_NETWORK="mmirioma_prod_data" \
BACKUP_KEEP_DAYS="$keep" \
  bash "$root/deploy/backup.sh" "$dir"

if [[ -n "$remote" ]]; then
  command -v rclone >/dev/null || { echo "BACKUP_RCLONE_REMOTE is set but rclone is not installed" >&2; exit 1; }
  # copy, not sync: a deleted local file never deletes the off-site copy.
  # Expiry of off-site copies is set on the storage side (lifecycle rule).
  rclone copy "$dir" "$remote" --include 'mmirioma-*.dump'
  echo "Copied to $remote"
else
  echo "WARNING: no off-VPS target (BACKUP_RCLONE_REMOTE is unset). This backup is only on this VPS." >&2
fi
