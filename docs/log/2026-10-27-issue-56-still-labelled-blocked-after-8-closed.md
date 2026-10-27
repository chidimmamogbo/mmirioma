# 2026-10-27: #56 was still labelled blocked after its dependency closed

- **Area:** process
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** #56 carried the `blocked` label and "Depends on: #8", but #8
  was closed and both contracts it needed (`auth.md` change password and
  `public-site.md`) were already `Status: agreed`.
- **Cause:** labels are not updated when a dependency closes.
- **Fix / workaround:** checked both contracts' status before starting, and
  moved the label to `unblocked`. When closing an issue, check the issues
  that name it in "Depends on".
- **Status:** resolved
- **Refs:** #56, #8, PR #55
