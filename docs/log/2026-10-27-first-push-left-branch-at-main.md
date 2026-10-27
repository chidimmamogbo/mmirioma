# 2026-10-27: Commits landed on `main` after the checkout switched, so the first push sent an empty branch

- **Area:** tooling
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** `git push -u origin feat/67-partner-account` printed
  `* [new branch] feat/67-partner-account -> feat/67-partner-account`, but
  `gh pr create` then failed with
  `GraphQL: No commits between main and feat/67-partner-account (createPullRequest)`.
  `git ls-remote origin feat/67-partner-account` showed `main`'s commit
  (`fca4096`), not the new commit (`86d01bd`). The next day, local `main`
  was 2 commits ahead of `origin/main`.
- **Cause:** while the work was in progress, the checkout moved from the
  feature branch back to `main`. The reflog shows
  `checkout: moving from feat/67-partner-account to main` at 00:47, and the
  agent did not run that command; it was most likely the VS Code Git
  extension or a manual switch. The agent then committed without checking
  the branch, so both commits went onto local `main`. Pushing
  `feat/67-partner-account` sent the branch as it was: still at `main`'s
  commit.
- **Fix / workaround:** `git push origin HEAD:refs/heads/feat/67-partner-account`
  sent the commits to the right remote branch, so PR #69 is correct. Local
  `main` was reset to `origin/main`, and the local feature branch was
  fast-forwarded to `origin/feat/67-partner-account`. Run
  `git branch --show-current` before every commit, and compare
  `git ls-remote origin <branch>` with `git rev-parse HEAD` before opening a
  PR.
- **Status:** resolved
- **Refs:** #67, PR #69
