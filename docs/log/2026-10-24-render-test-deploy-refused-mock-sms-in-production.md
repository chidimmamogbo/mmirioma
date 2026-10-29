# 2026-10-24: Render test deploy refused to start with the mock SMS provider

- **Area:** tooling
- **Author:** nnamdi-security (+ agent)
- **Symptom:** A throwaway test deploy on Render (free instance and free
  database) failed at `alembic upgrade head`, before uvicorn started:
  `pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings`
  `Value error, SMS_PROVIDER must be termii in production [type=value_error, ...]`.
- **Cause:** The service had `APP_ENV=production` and no `SMS_PROVIDER`, so
  the default `mock` applied. `Settings._validate_production`
  (`backend/app/core/config.py`) refuses to start in production with the mock
  provider, on purpose: it would tell customers a code was sent when it was not
  (FR-003). Alembic's `env.py` loads the same settings, so the migration step
  fails first.
- **Fix / workaround:** Do not change the guard. A test deploy with no real
  customers is not production (docs/architecture/deployment.md, "Production
  means real data"), so either:
  1. set `APP_ENV=development`, plus `SESSION_COOKIE_SECURE=true` (Render
     serves HTTPS) and a fixed `SESSION_SECRET` (otherwise each restart makes
     a new one and signs everyone out). Codes are then not sent; they appear
     in the Render logs as `MOCK SMS (not sent) to +234...: ...`; or
  2. keep `APP_ENV=production` and set `SMS_PROVIDER=termii`,
     `TERMII_API_KEY` and `TERMII_SENDER_ID` (#102), which sends real SMS and
     uses Termii credit.
- **Status:** workaround
- **Refs:** `backend/app/core/config.py`, `backend/alembic/env.py`,
  docs/architecture/deployment.md, #102, #103.
