# 2026-10-26: A stash around a slow migration left the edits stashed for minutes

- **Area:** tooling
- **Author:** Bonvee120 + Claude Code
- **Symptom:** To migrate the local database to `main`'s head without the
  branch's unfinished models, the agent ran `git stash -q && alembic upgrade
  head; git stash pop -q` in one command. The upgrade took over two minutes,
  so the command was moved to the background, and the branch's tracked edits
  stayed in `stash@{0}` until it finished. The agent ran `git stash` without
  asking first, which the team workflow requires for git actions.
- **Cause:** Chaining a git action that hides work with a command of unknown
  length. The first `alembic upgrade head` on a fresh database is slow
  locally (see the next entry).
- **Fix / workaround:** The pop ran when the upgrade finished; `git stash
  list` was empty and every edit was back. Next time, migrate the database
  before editing models, or autogenerate against the branch as it is. Do not
  stash without asking.
- **Status:** resolved
- **Refs:** #61
