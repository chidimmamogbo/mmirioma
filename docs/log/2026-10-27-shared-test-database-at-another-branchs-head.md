# 2026-10-27: The shared test database was at another branch's migration head

- **Area:** database
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** on `feat/56-change-password-and-support-contact` (from
  `main`, head `0016`), `alembic upgrade head` on `mmirioma_fork_test`
  failed with `FAILED: Can't locate revision identified by '0018'`. The
  database had been migrated on `feat/21-quotes`, whose head is `0018`.
- **Cause:** one local test database is shared by every branch, and a
  branch cannot downgrade migrations it does not have.
- **Fix / workaround:** drop and recreate the test database (it holds test
  data only), then `alembic upgrade head` on the current branch. Do it each
  time you switch to a branch with a different migration head. Never do
  this to the dev database.
- **Status:** workaround
- **Refs:** #56, #21, [renumbering entry](2026-10-27-two-open-prs-took-the-same-migration-number.md)
