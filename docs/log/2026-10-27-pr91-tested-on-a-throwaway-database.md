# 2026-10-27: PR #91 tested on its own throwaway database

- **Area:** database
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** the FR-055 fix for PR #91 had to be tested on
  `feat/82-customer-notifications` (migration head `0018`, 22 commits behind
  `main`), while `mmirioma_fork_test` may be at another branch's head
  ([shared test database entry](2026-10-27-shared-test-database-at-another-branchs-head.md)).
  The first `ruff format --check .` also failed with
  `1 file would be reformatted` (`tests/test_customer_messages.py`: one
  missing blank line before `class Recorder`).
- **Cause:** one shared local test database for every branch; the new test
  was added by a script, not by the editor's formatter.
- **Fix / workaround:** instead of dropping the shared database, created a
  throwaway one in the same container
  (`CREATE DATABASE mmirioma_pr91_test`, `CREATE EXTENSION postgis`),
  pointed `TEST_DATABASE_URL` at it, ran `alembic upgrade head`,
  `alembic check` and `pytest` (1179 passed), then dropped it. Other
  branches' tests are not disturbed. `ruff format` fixed the blank line.
- **Status:** resolved
- **Refs:** PR #91, FR-055.
