# 2026-10-28: A click-through needs a migrated database; a scratch one keeps yours safe

- **Area:** tooling
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** Setting up the #176 click-through, the local Docker database
  `mmirioma` was at migration `0018` (head is `0022`) and the demo accounts'
  password was not known to the agent. A first attempt to point
  `DATABASE_URL` at a scratch database with `sed 's#/mmirioma#/mmirioma_clicktest#'`
  rewrote the *user name* (`//mmirioma:`), not the database name, and failed
  with `password authentication failed for user "mmirioma_clicktest"`.
- **Cause:** `/mmirioma` also matches the user name in the URL. Nothing ran,
  but a correct-looking mistake could have migrated the real database.
- **Fix / workaround:** Create a scratch database in the same container
  (`create database mmirioma_clicktest`, then `create extension postgis`), and
  replace only the last path segment (`re.sub(r'/mmirioma(\?.*)?$', ...)`),
  checking the result ends in `/mmirioma_clicktest` before running
  `alembic upgrade head`. Then seed with a throwaway password (see
  `2026-10-27-demo-seed-hangs-without-a-console.md`), add sources
  (`docs/process/local-quote-setup.md`, step 2), start the backend with
  `SMS_PROVIDER=mock` and the frontend with `VITE_USE_MOCKS=false`, and drop
  the scratch database afterwards. The owner's `mmirioma` database was left at
  `0018`, untouched.
- **Status:** workaround
- **Refs:** #176, `docs/process/local-quote-setup.md`
