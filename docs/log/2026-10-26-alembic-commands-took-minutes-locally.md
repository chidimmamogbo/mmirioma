# 2026-10-26: Alembic commands took minutes against the local database

- **Area:** database
- **Author:** Bonvee120 + Claude Code
- **Symptom:** On Windows, `alembic upgrade head` on a fresh database took over
  two minutes, and `upgrade head && check && downgrade -1 && upgrade head &&
  check` over ten. Each command finished with exit code 0. While one was
  slow, `pg_stat_activity` showed no session from it.
- **Cause:** Not found. Connecting to `localhost:5432` took about 2 seconds
  (IPv6 `::1` is tried first; compose publishes only `127.0.0.1`), which
  explains seconds, not minutes.
- **Fix / workaround:** Run long alembic chains in the background and wait.
  For tests, set `TEST_DATABASE_URL` with `127.0.0.1` instead of
  `localhost`; the integration tests then ran in about 20 seconds.
- **Status:** open
- **Refs:** #61, `compose.yaml`
