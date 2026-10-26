# 2026-10-27: Two open pull requests took the same migration number

- **Area:** database
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** PR #64 (partner accounts) merged with
  `20261026_0016_add_partner_accounts.py` (revision `0016`, revises `0015`).
  PR #62 (#21 part 1) had `20261026_0016_add_order_delivery_details.py`,
  also `0016` revising `0015`. GitHub still showed #62 as mergeable, because
  the file names differ, but merging it would give Alembic two heads and
  `alembic upgrade head` would fail. The same happened earlier with `0015`
  (#58 and #21), fixed by restacking #21 onto `main`.
- **Cause:** migration numbers are taken when a branch is created, and
  several backend PRs were open at once. Neither CI nor GitHub compares
  revision ids across open PRs.
- **Fix / workaround:** merged `main` into `feat/21-order-details`, renamed
  the migration to `0017` (revises `0016`) and updated `docs/features/orders.md`.
  The stacked `feat/21-quotes` moved from `0017` to `0018`. The local test
  database had the old `0017` stamped, so it was dropped, recreated and
  migrated from scratch. Before merging a PR with a migration, check
  `alembic heads` on `main` plus the branch; whoever merges second
  renumbers.
- **Status:** workaround
- **Refs:** #21, PR #62, PR #64, PR #65
