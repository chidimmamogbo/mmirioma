# 2026-10-24: `gh pr edit` failed on the Projects (classic) deprecation

- **Area:** tooling (GitHub)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** `gh pr edit 148 --title ... --body-file ...` changed nothing
  and printed `GraphQL: Projects (classic) is being deprecated in favor of
  the new Projects experience ... (repository.pullRequest.projectCards)`.
- **Cause:** As with `gh issue view` (`LOG.md`, 2026-10-23), the command
  still queries classic project cards, which GitHub now refuses.
- **Fix / workaround:** Use the REST API:
  `gh api -X PATCH repos/mmiri-oma/mmirioma/pulls/<n> -f title="..." -F body=@<file>`.
- **Status:** workaround
- **Refs:** PR #148
