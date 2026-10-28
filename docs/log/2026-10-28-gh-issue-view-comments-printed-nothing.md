# 2026-10-28: `gh issue view --comments` printed nothing

- **Area:** tooling
- **Author:** Bonvee120 (+ agent)
- **Symptom:** `gh issue view 165 --repo chidimmamogbo/mmirioma --comments`
  exited 0 with no output, both chained after `git pull` and on its own in Git
  Bash on Windows.
- **Cause:** unknown. `gh auth status` showed a valid login, so it was not
  authentication.
- **Fix / workaround:** `gh issue view <n> --repo chidimmamogbo/mmirioma --json
  number,title,state,body,comments` printed the issue and its comments.
- **Status:** workaround
- **Refs:** #165
