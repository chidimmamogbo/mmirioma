# 2026-10-26: Command-line tool ran against the local database instead of Render

- **Area:** tooling
- **Author:** nnamdi-security (+ agent)
- **Symptom:** `python -m app.modules.sources.cli list-categories`, meant for
  the Render test database, failed with
  `sqlalchemy.exc.ProgrammingError: (sqlalchemy.dialects.postgresql.asyncpg.ProgrammingError) relation "water_categories" does not exist`.
- **Cause:** `DATABASE_URL` was given as a prefix on the earlier seed command
  only, so this command read the repository `.env` and connected to the local
  development database. That database was at migration `0009`;
  `water_categories` arrives in `0011` (head is `0013`).
- **Fix / workaround:** `export DATABASE_URL='postgresql+asyncpg://...?ssl=require'`
  once in the shell before running several command-line tools against a
  remote database (or prefix every command), and `unset DATABASE_URL`
  afterwards so later commands do not write to it by mistake. Bring the local
  database up to date separately with `alembic upgrade head`.
- **Status:** resolved
- **Refs:** `backend/app/core/config.py` (environment variables override
  `.env`), `backend/app/modules/sources/cli.py`, migration `0011`.
