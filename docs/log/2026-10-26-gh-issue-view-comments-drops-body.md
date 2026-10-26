# 2026-10-26: `gh issue view --comments` left out the issue body

- **Area:** tooling
- **Author:** Bonvee120 (+ agent); reproduced by chidimmamogbo + Claude Code
- **Symptom:** Step 1 of `/work-issue` ran `gh issue view <n> --comments` in Git Bash. The agent saw no issue body (and nothing at all for an issue without comments).
- **Cause:** When its output is not a terminal, as in an agent's shell, `gh issue view --comments` prints only the comments, in raw form, without the title or body (checked with gh 2.102.0 on issue #14).
- **Fix / workaround:** Read issues with `gh issue view <n> --repo chidimmamogbo/mmirioma --json title,body,labels,comments`. `.claude/commands/work-issue.md` step 1 now does this.
- **Status:** resolved
- **Refs:** issue #14, `.claude/commands/work-issue.md`
