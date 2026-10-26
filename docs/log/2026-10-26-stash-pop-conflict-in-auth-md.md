# 2026-10-26: Moving uncommitted contract edits to a new branch conflicted in auth.md

- **Area:** GitHub (git)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** The #8 contract edits were written while `feat/6-phone-verification` was checked out. `git stash -u`, `git switch main`, `git pull`, `git switch -c docs/8-auth-public-contracts`, `git stash pop` stopped with a conflict in `docs/api/auth.md` ("The stash entry is kept in case you need it again").
- **Cause:** `main` had gained the partner amendment to `auth.md` (#47, `cc2fb0d`) in the same places: the status lines at the top and the open questions / Changes table at the bottom.
- **Fix / workaround:** Kept both sides by hand (partner amendment status, then the change-password status; both rows in the Changes table), staged the file and dropped the stash. Next time, branch from an up-to-date `main` before editing a shared contract.
- **Status:** resolved
- **Refs:** #8, #47, `docs/api/auth.md`
