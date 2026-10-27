# 2026-10-27: A contract PR went stale while other PRs merged

- **Area:** process
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** PR #71 (#22 contract) was branched from an up-to-date `main`,
  but #62 and #65 (#21), #68 (#48) and #70 (#56) merged while it was being
  written. GitHub showed no conflict (`mergeable=MERGEABLE`), yet the
  contract said "`null` until #21" for fields #21 had just added, and called
  `customer-account.md` proposed after it was agreed. Found only in a later
  backlog check (`main` 14 commits behind `origin/main`).
- **Cause:** a docs-only change rarely conflicts, so nothing flags when the
  facts it cites change on `main`.
- **Fix / workaround:** merged `origin/main` into the branch, updated the
  contract and examples, and pushed (`6a1db35`). Before opening a PR, and
  again before asking for review, run `git fetch origin && git log
  HEAD..origin/main --oneline`, and re-read any contract or model the
  document cites that those commits touched.
- **Status:** resolved
- **Refs:** PR #71, #22, #21, #48
