# 2026-10-26: Backticks inside a `node -e` string broke a PR description

- **Area:** tooling
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** Editing the PR #28 body with a `node -e "..."` script in Git Bash
  printed `bash: quote.water_category\: No such file or directory` (and four
  more like it), and the published description lost every inline code span
  (`- **Applied:**  on ; ...`).
- **Cause:** Inside a double-quoted Bash string, backticks are command
  substitution even when escaped for JavaScript, so Bash ran each code span as
  a command and replaced it with nothing.
- **Fix / workaround:** Fixed the body file with a normal file edit and ran
  `gh pr edit --body-file` again. Next time, write Markdown to a file with the
  editor (or a quoted heredoc, `<<'EOF'`) and never put backticks in a
  double-quoted shell string. Related: PowerShell also mangles `gh --jq`
  strings that contain `\(...)`; run those in Bash.
- **Status:** resolved
- **Refs:** PR #28
