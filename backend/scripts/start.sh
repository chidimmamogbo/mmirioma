#!/bin/sh
# Container start (backend/Dockerfile): migrate, then serve.
#
# 1. `alembic upgrade head` brings the database to this release's schema. If it
#    fails the container exits, the health check never passes and Railway keeps
#    the previous deployment serving (docs/architecture/deployment.md).
# 2. uvicorn on Railway's PORT. Railway's edge terminates TLS and sends
#    X-Forwarded-Proto: https; --proxy-headers lets the app see https. The edge
#    address is not fixed, hence --forwarded-allow-ips '*'; the container is
#    reachable only through Railway's proxy and private network.
set -eu

alembic upgrade head
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --proxy-headers \
  --forwarded-allow-ips '*' \
  --no-server-header
