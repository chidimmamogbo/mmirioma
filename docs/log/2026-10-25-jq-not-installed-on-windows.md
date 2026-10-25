# 2026-10-25: `jq` is not installed in Git Bash on Windows

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `gh api -X PUT .../branches/main/protection --input - | jq ...` printed `bash: jq: command not found` and `write /dev/stdout: The pipe is being closed.` The protection was still saved; only the display step failed.
- **Cause:** Git Bash on Windows ships without `jq`.
- **Fix / workaround:** Use the `--jq` flag that `gh` has built in: `gh api <path> --jq '<filter>'`. Read the setting back afterwards to confirm a write.
- **Status:** resolved
- **Refs:** branch protection on `main`, PR adding the team workflow
