# 2026-10-26: The fork checkout had no virtualenv and shares the database with the main repo

- **Area:** database
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** in a fresh clone of the fork, `scripts/versions.sh` printed
  `backend/.venv not found`, and there was no `.env`. The local PostGIS
  container is shared with a checkout of `mmiri-oma/mmirioma`, whose test
  database `mmirioma_test` was at revision `0013`, the same number as the
  fork's head, while the fork was about to add its own `0014`.
- **Cause:** each checkout needs its own virtualenv. Both repositories number
  migrations independently, so upgrading one shared test database with the
  fork's `0014` would break the main repo's `alembic check` (or its own
  `0014` later).
- **Fix / workaround:** `cd backend && python3.14 -m venv .venv &&
  .venv/bin/pip install -r requirements-dev.txt`, and a separate database
  for the fork: `CREATE DATABASE mmirioma_fork_test`, then
  `DATABASE_URL=<…>/mmirioma_fork_test alembic upgrade head`, and run
  integration tests with `TEST_DATABASE_URL` pointing at it. Never point
  the fork's migrations at `mmirioma_test` or `mmirioma`.
- **Status:** workaround
- **Refs:** #30
