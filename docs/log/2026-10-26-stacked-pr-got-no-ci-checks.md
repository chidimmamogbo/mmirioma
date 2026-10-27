# 2026-10-26: A stacked pull request got no CI checks

- **Area:** CI
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** `gh pr checks 65 --repo chidimmamogbo/mmirioma --watch`
  printed `no checks reported on the 'feat/21-quotes' branch`.
- **Cause:** PR #65 is based on `feat/21-order-details` (stacked on #62),
  and `.github/workflows/ci.yml` runs on `pull_request` only for
  `branches: [main]`.
- **Fix / workaround:** run CI by hand on the branch:
  `gh workflow run ci.yml --repo chidimmamogbo/mmirioma --ref <branch>`, then
  `gh run watch <run id> --repo chidimmamogbo/mmirioma --exit-status`. Once
  the base PR merges and its branch is deleted, GitHub retargets the stacked
  PR to `main` and CI runs normally.
- **Status:** workaround
- **Refs:** #21, PR #62, PR #65, run 40413581908
