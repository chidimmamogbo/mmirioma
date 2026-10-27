# 2026-10-27: A push recreated a branch deleted at merge

- **Area:** GitHub
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** After adding a log entry to `feat/9-link-customer-orders`,
  `git push` answered "Create a pull request for
  'feat/9-link-customer-orders' on GitHub by visiting: ...". PR #76 had been
  approved and merged (and the branch deleted) while a local check was
  running, so the push recreated the deleted branch with one extra commit.
- **Cause:** The PR's state was not checked before pushing to its branch.
- **Fix / workaround:** The commit was cherry-picked onto a new branch from
  `main` (`docs/log-demo-seed-console`) for its own PR, and the recreated
  branch was deleted. Before pushing to a PR's branch, run
  `gh pr view <n> --json state` and push only if it is `OPEN`. A "Create a
  pull request" hint after pushing to an existing PR's branch means the PR is
  gone.
- **Status:** resolved
- **Refs:** #9, PR #76
