# 2026-10-27: Starting CI by hand returned HTTP 500 once

- **Area:** GitHub
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** `gh workflow run ci.yml --repo chidimmamogbo/mmirioma --ref
  feat/21-quotes` failed with `could not create workflow dispatch event:
  HTTP 500 (https://api.github.com/repos/chidimmamogbo/mmirioma/actions/workflows/390684914/dispatches)`.
- **Cause:** a transient GitHub error; nothing in the request was wrong.
- **Fix / workaround:** ran the same command again a few seconds later; the
  run started (40418364167) and passed. Check `gh run list --branch <branch>`
  before retrying, so a run is not started twice.
- **Status:** resolved
- **Refs:** #21, PR #65, [stacked PR entry](2026-10-26-stacked-pr-got-no-ci-checks.md)
