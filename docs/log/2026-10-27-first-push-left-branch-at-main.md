# 2026-10-27: First push of a new branch left it pointing at `main`

- **Area:** GitHub
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** `git push -u origin feat/67-partner-account` printed
  `* [new branch] feat/67-partner-account -> feat/67-partner-account`, but
  `gh pr create` then failed with
  `GraphQL: No commits between main and feat/67-partner-account (createPullRequest)`.
  `git ls-remote origin feat/67-partner-account` showed `main`'s commit
  (`fca4096`), not the branch's (`86d01bd`). A second
  `git push origin feat/67-partner-account` said `Everything up-to-date`
  without changing it.
- **Cause:** unknown. The local tracking ref `origin/feat/67-partner-account`
  also pointed at `fca4096`. The branch config has a `vscode-merge-base`
  entry, so the VS Code Git extension may have published the branch from
  `origin/main` at the same moment. This is not confirmed.
- **Fix / workaround:** push the commit to the branch by name:
  `git push origin HEAD:refs/heads/feat/67-partner-account`. It fast-forwarded
  `fca4096..86d01bd`. Before opening a PR, compare `git ls-remote origin <branch>`
  with `git rev-parse HEAD`.
- **Status:** workaround
- **Refs:** #67, PR #69
