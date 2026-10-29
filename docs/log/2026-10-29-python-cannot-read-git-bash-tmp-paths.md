# 2026-10-29: A Python helper could not open `/tmp/...` that Git Bash had written

- **Area:** tooling
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** A click-through setup script that read the mock SMS code from
  `/tmp/clicktest-backend.log` failed with `FileNotFoundError: [Errno 2] No
  such file or directory: '/tmp/clicktest-backend.log'`, although the backend
  had written the log there from Git Bash.
- **Cause:** `/tmp` is a Git Bash path. A Windows Python process resolves it
  against the current drive, not against Git Bash's mapping.
- **Fix / workaround:** Read the log with a shell command in Git Bash
  (`grep -n "MOCK SMS" /tmp/clicktest-backend.log`), then pass the six digits to
  the script, or write the log to a Windows path.
- **Status:** workaround
- **Refs:** #220, `docs/log/2026-10-29-support-request-create-needs-a-uuid-idempotency-key.md`
