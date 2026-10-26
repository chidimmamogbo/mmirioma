# 2026-10-26: `gh pr checks --watch` stopped on a TLS handshake timeout

- **Area:** tooling
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** `gh pr checks 35 --repo chidimmamogbo/mmirioma --watch`
  exited with `Post "https://api.github.com/graphql": net/http: TLS handshake timeout`.
- **Cause:** a passing network problem between the machine and GitHub; the
  checks themselves were fine.
- **Fix / workaround:** run it again. In scripts, retry a few times:
  `for i in 1 2 3; do gh pr checks <pr> --repo chidimmamogbo/mmirioma --watch && break; sleep 5; done`.
- **Status:** workaround
- **Refs:** PR #35
