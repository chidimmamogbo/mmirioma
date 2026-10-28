# 2026-10-28: The local test database was four migrations behind head

- **Area:** database
- **Author:** Bonvee120 (+ agent)
- **Symptom:** before running the integration tests for #165, `alembic current`
  on `mmirioma_fork_test` printed `0018` while `alembic heads` printed `0022`.
  Integration tests would have failed on the missing tables and columns.
- **Cause:** the test database was last migrated on an older branch; each
  `main` pull adds migrations it does not have yet.
- **Fix / workaround:** `DATABASE_URL="$TEST_DATABASE_URL" alembic upgrade head`
  (sourcing `../.env` first). It ran 0018 to 0022 and the integration tests then
  passed. Check `alembic current` against `alembic heads` after every pull.
- **Status:** resolved
- **Refs:** #165, [shared test database entry](2026-10-27-shared-test-database-at-another-branchs-head.md)
