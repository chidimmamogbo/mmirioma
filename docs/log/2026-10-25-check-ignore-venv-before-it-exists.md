# 2026-10-25: `git check-ignore .venv` fails before the virtualenv exists

- **Area:** tooling
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `git check-ignore .venv && python -m venv .venv` in `backend/` stopped with exit code 1 and created nothing.
- **Cause:** The `.gitignore` rule is `.venv/`. A trailing slash matches only a directory, so git does not count the path as ignored until the folder exists.
- **Fix / workaround:** Create the virtualenv first, then check it with `git check-ignore -q .venv`.
- **Status:** resolved
- **Refs:** `.gitignore`
