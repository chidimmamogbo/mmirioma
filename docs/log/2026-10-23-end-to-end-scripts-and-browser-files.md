# 2026-10-23: The end-to-end script had no `httpx`, and the browser tool wrote files into the repository

- **Area:** tooling
- **Author:** Bonvee120 + Claude Code
- **Symptom:** For the #124 end-to-end run, the API script failed with
  `ModuleNotFoundError: No module named 'httpx'` in the backend virtualenv.
  The Playwright browser tool then saved page snapshots, console logs and
  screenshots under the repository root (`.playwright-mcp/`, `e2e-*.png`),
  and refused a screenshot path in the scratchpad: `File access denied: ...
  is outside allowed roots`.
- **Cause:** `httpx` is not a project dependency. The browser tool may only
  write inside the workspace.
- **Fix / workaround:** Wrote the script with the standard library
  (`urllib.request` with a cookie jar and the CSRF header) instead of adding
  a dependency. Moved the screenshots out and deleted `.playwright-mcp/`
  before committing; check `git status` for them after any browser run.
- **Status:** workaround
- **Refs:** #124, `docs/features/driver-cash.md` (end-to-end run)
