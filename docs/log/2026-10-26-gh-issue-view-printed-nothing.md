# 2026-10-26: `gh issue view --comments` printed nothing

- **Area:** tooling (GitHub)
- **Author:** Bonvee120 + Claude Code
- **Symptom:** In Git Bash on Windows, `gh issue view 14 --repo
  chidimmamogbo/mmirioma --comments` exited 0 and printed nothing, not even
  an error. Redirecting the output to a file gave an empty file. `gh auth
  status` showed a valid login.
- **Cause:** Not confirmed. It is probably the Projects (classic) problem
  recorded in `LOG.md` (2026-10-23, "`gh issue view` failed on the Projects
  (classic) deprecation"), with the error lost when the output is not a
  terminal.
- **Fix / workaround:** Ask for the fields explicitly:
  `gh issue view 14 --repo chidimmamogbo/mmirioma --json number,title,state,body,comments,labels`.
  This is the command to use in step 1 of `.claude/commands/work-issue.md`.
- **Status:** workaround
- **Refs:** #14
