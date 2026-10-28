# 2026-10-28: `git fetch` hung with no output

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** `git fetch -q origin`, chained with other commands, produced no
  output for over two minutes, and the shell tool moved the whole command to
  the background (the process list showed only `git fetch -q origin`).
- **Cause:** a stalled network connection to GitHub; the same fetch worked a
  minute later.
- **Fix / workaround:** stop the background task, then rerun the fetch alone
  with a limit (`timeout 60 git fetch -q origin`). Do not chain a fetch in
  front of other commands without a timeout.
- **Status:** workaround
- **Refs:** #166.
