#!/usr/bin/env bash
# Run Docker Compose against the production stack (compose.production.yaml).
#
# Usage (from anywhere; the repository is found from this script's location):
#   deploy/prod.sh build api
#   deploy/prod.sh up -d
#   deploy/prod.sh logs -f --tail 100 api
#   APP_VERSION=<older-commit> deploy/prod.sh up -d --no-build api    # rollback
#
# It adds the environment file and the compose file, and tags the API image with
# the current git commit unless APP_VERSION is already set. The image of an older
# release stays on the server, so going back is a re-tag, not a rebuild.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${PROD_ENV_FILE:-$root/.env.production}"

[[ -f "$env_file" ]] || { echo "Missing $env_file. Copy .env.production.example and fill it in." >&2; exit 1; }

if [[ -z "${APP_VERSION:-}" ]]; then
  APP_VERSION="$(git -C "$root" rev-parse --short=12 HEAD 2>/dev/null || echo latest)"
fi
export APP_VERSION

export PROD_ENV_FILE="$env_file"
exec docker compose --env-file "$env_file" -f "$root/compose.production.yaml" "$@"
