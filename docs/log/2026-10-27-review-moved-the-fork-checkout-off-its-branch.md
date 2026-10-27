# 2026-10-27: A review moved the fork checkout off its branch

- **Area:** process
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** while reviewing PRs, the agent ran
  `git checkout -q --detach origin/main` in the main fork checkout
  (`~/Documents/Mmirioma-fork/mmirioma`), which was on
  `docs/linking-plan-customer-account`. `git status` showed `## HEAD (no branch)`.
- **Cause:** it wanted to read files at `origin/main` and switched the
  working checkout instead of using a separate worktree. CLAUDE.md forbids
  switching branches without permission.
- **Fix / workaround:** switched straight back
  (`git checkout docs/linking-plan-customer-account`); the tree was clean,
  so nothing was lost. Read other refs with `git show "<ref>:<path>"` or a
  worktree in a scratch directory (`git worktree add --detach <dir> <ref>`),
  never by checking out in someone's working copy.
- **Status:** resolved
- **Refs:** PR reviews of 2026-10-27 (#97, #101, #106).
