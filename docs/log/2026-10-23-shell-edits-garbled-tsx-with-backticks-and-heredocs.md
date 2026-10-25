# 2026-10-23: Shell edits garbled TypeScript with backticks and heredocs

- **Area:** tooling
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Appending to `driverJobs.ts` with a Bash heredoc failed with
  `unexpected EOF while looking for matching ''` (nothing written). A
  `node -e` replacement in `JobCard.tsx` printed `syntax error near
  unexpected token 'job.order_reference'` and wrote `to={}` where a template
  literal should have been; typecheck still passed until the tests ran.
- **Cause:** Bash command substitution and quoting inside the agent's shell
  (see LOG.md, 2026-10-20 heredocs and 2026-10-20 shell edits): backticks in
  TypeScript template literals were read by Bash.
- **Fix / workaround:** Made the edits with the editor tool and an absolute
  path helper (`jobScreenPath`) instead of a template literal. Do not edit
  TypeScript with template literals through Bash; check a scripted edit with
  `git diff` before moving on.
- **Status:** workaround
- **Refs:** #97
