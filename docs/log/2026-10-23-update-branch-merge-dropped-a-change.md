# 2026-10-23: Bringing a branch up to date silently dropped one of its changes

- **Area:** GitHub (process)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** PR #137 changed the privacy row of
  `docs/process/pilot-plan.md` (section 7), but after it merged, `main` still
  had the old row. No error was shown and every check passed.
- **Cause:** Before merging, `main` was merged into the branch (commit
  `e884676`, "Merge branch 'main' into feat/129-privacy-cash-check"). That
  merge kept `main`'s version of the conflicting row instead of the
  branch's, so the PR merged without its own change. Nothing else in #137
  was lost (every added line was checked against `main`).
- **Fix / workaround:** The row was restored, updated, by the technical
  lead decisions PR of 2026-10-23. When resolving a conflict while updating
  a branch (GitHub's "Update branch" editor or locally), keep the branch's
  own change unless it is meant to go, and check the PR's "Files changed"
  still shows every intended change before merging.
- **Status:** resolved
- **Refs:** PR #137, commit `e884676`, `docs/process/pilot-plan.md`
