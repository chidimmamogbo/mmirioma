# 2026-10-27: Deleting merged remote branches was blocked by the agent's permission check

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** during a backlog check, `git push origin --delete <branch>` for
  six branches of merged PRs was refused before it ran: "Permission for this
  action was denied by the Claude Code auto mode classifier. Reason: [Git
  Destructive]". The script deleted a branch only when
  `git merge-base --is-ancestor origin/<branch> origin/main` passed.
- **Cause:** the automatic permission check treats deleting a remote branch
  as destructive, even when the branch is fully merged.
- **Fix / workaround:** delete merged branches in the browser (the PR page's
  "Delete branch" button), or run the command yourself. To let the agent do
  it, add a narrow allow rule to your own Claude Code user settings (not
  committed), as in `2026-10-26-issue-body-edit-blocked-by-agent-permissions.md`.
  Turning on "Automatically delete head branches" in the fork's settings
  avoids the backlog. Local branches were cleaned safely with `git branch -d`,
  which refuses unmerged branches. Left on the fork: `chore/contract-approval-rule`,
  `docs/30-public-zone-list`, `docs/30-zone-amendments`,
  `docs/30-zone-screen-changes`, `docs/log-permission-rule-resolved`,
  `feat/30-service-zones` (all merged, PRs #36, #38, #41, #46, #49, #50).
- **Status:** workaround
- **Refs:** PR #75
