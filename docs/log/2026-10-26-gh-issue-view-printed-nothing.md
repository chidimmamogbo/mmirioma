# 2026-10-26: `gh issue view` printed nothing in the agent's shell

- **Area:** tooling
- **Author:** Cloudcrackamara (+ Claude Code)
- **Symptom:** `gh issue view 18 --repo chidimmamogbo/mmirioma --comments`
  exited 0 with no output, from Git Bash run by Claude Code on Windows.
- **Cause:** unknown. Probably `gh`'s text view needs a terminal (pager or TTY
  detection) and prints nothing when stdout is not one.
- **Fix / workaround:** ask for JSON, which prints without a terminal:
  `gh issue view 18 --repo chidimmamogbo/mmirioma --json number,title,state,body,comments,labels`.
- **Status:** workaround
- **Refs:** #18
