#!/usr/bin/env bash
# Back up the MmiriOma database to a local folder (NFR-014).
#
# Keep a copy off the server that hosts the database; the off-site target is an
# open decision (docs/deployment/hostinger.md, "Backups"; the production wrapper
# is deploy/production-backup.sh). Writes one `pg_dump --format=custom` file, checks it can be
# read back, and deletes this folder's backups older than BACKUP_KEEP_DAYS.
#
# Usage:
#   BACKUP_DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/DB' deploy/backup.sh [FOLDER]
#
# Settings (environment):
#   BACKUP_DATABASE_URL  required; the app's DATABASE_URL works too
#                        (postgresql+asyncpg:// is accepted). Never commit it.
#   BACKUP_DIR           folder when no argument is given (default: ./backups)
#   BACKUP_KEEP_DAYS     delete older backups in the folder (default: 30, the
#                        privacy notice's backup retention, section 8)
#   BACKUP_USE_DOCKER=1  run pg_dump from the postgis/postgis:16-3.4 image, so
#                        the client matches the server (no local install)
#   BACKUP_DOCKER_NETWORK  Docker network for that container (local tests)
set -euo pipefail

url="${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL (never commit it)}"
url="${url/postgresql+asyncpg:\/\//postgresql://}"
dir="${1:-${BACKUP_DIR:-./backups}}"
keep_days="${BACKUP_KEEP_DAYS:-30}"
image="postgis/postgis:16-3.4"

umask 077
mkdir -p "$dir"
dir="$(cd "$dir" && pwd)"
# Git Bash on Windows: Docker needs the Windows form of the folder (pwd -W);
# its /tmp-style path would name a folder inside Docker's own VM.
mount_dir="$(cd "$dir" && (pwd -W 2>/dev/null || pwd))"
name="mmirioma-$(date -u +%Y%m%dT%H%M%SZ).dump"

# Run a PostgreSQL client command, locally or in the image, with the backup
# folder at /backups inside the container.
pg() {
  if [[ "${BACKUP_USE_DOCKER:-0}" == "1" ]]; then
    local network=()
    [[ -n "${BACKUP_DOCKER_NETWORK:-}" ]] && network=(--network "$BACKUP_DOCKER_NETWORK")
    MSYS_NO_PATHCONV=1 docker run --rm "${network[@]}" -v "$mount_dir:/backups" "$image" "$@"
  else
    "$@"
  fi
}

if [[ "${BACKUP_USE_DOCKER:-0}" == "1" ]]; then target="/backups/$name"; else target="$dir/$name"; fi

pg pg_dump --format=custom --no-owner --no-privileges --dbname="$url" --file="$target"
# A dump that cannot be listed cannot be restored: fail now, not on restore day.
pg pg_restore --list "$target" >/dev/null

find "$dir" -maxdepth 1 -name 'mmirioma-*.dump' -type f -mtime "+$keep_days" -delete
echo "Backup written: $dir/$name"
