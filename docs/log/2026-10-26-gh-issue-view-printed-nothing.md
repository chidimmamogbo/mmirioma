# 2026-10-26: `gh issue view` printed nothing in the agent's shell

- **Area:** tooling
- **Author:** Cloudcrackamara (+ Claude Code); also hit by Bonvee120 + Claude Code
- **Symptom:** `gh issue view 18 --repo chidimmamogbo/mmirioma --comments`
  exited 0 with no output, from Git Bash run by Claude Code on Windows. The
  same happened with issue #14 (no error; redirecting to a file gave an
  empty file; `gh auth status` showed a valid login).
- **Cause:** when stdout is not a terminal, `gh issue view --comments`
  prints only the comments and leaves out the title and body, so an issue
  with no comments prints nothing. Found later; see
  `2026-10-26-gh-issue-view-comments-drops-body.md`.
- **Fix / workaround:** ask for JSON, which prints without a terminal:
  `gh issue view <n> --repo chidimmamogbo/mmirioma --json title,body,labels,comments`.
  Step 1 of `.claude/commands/work-issue.md` now does this (#39).
- **Status:** resolved
- **Refs:** #14, #18, #39
