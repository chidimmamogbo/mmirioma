#!/bin/sh
# Default container start (backend/Dockerfile): migrate, then serve. For a
# throwaway or single-container run only. The Hostinger production stack
# (compose.production.yaml) does NOT use it: migrations there are explicit
# (deploy/production-migrate.sh) and proxy trust is limited to Caddy's network.
#
# 1. `alembic upgrade head` brings the database to this release's schema. If it
#    fails the container exits.
# 2. uvicorn on PORT. --proxy-headers with --forwarded-allow-ips '*' trusts any
#    sender of X-Forwarded-*: use this script only when the container is
#    reachable through a trusted proxy alone.
set -eu

alembic upgrade head
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --proxy-headers \
  --forwarded-allow-ips '*' \
  --no-server-header
