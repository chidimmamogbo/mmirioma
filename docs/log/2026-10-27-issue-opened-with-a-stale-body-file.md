# 2026-10-27: Issue opened with a stale body file

- **Area:** GitHub
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** #121 (link customer live prices) was opened with the text of an
  older draft, the #79 design issue, instead of its own.
- **Cause:** the new body was written to a scratch file whose name an earlier
  draft already used. The write was refused (the agent had not read the old
  file), but `gh issue create --body-file` ran in the same step and posted
  the old file.
- **Fix / workaround:** replaced the body with `gh issue edit 121
  --body-file`, then read the issue back to confirm. Next time: give each
  body file a new name, and only run `gh issue create` / `gh pr create` /
  `gh pr comment` after the file write has succeeded, never in the same
  batch.
- **Status:** resolved
- **Refs:** #121, #79
