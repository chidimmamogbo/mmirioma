# 2026-10-27: Click-through setup: no `.env`, port 5432 taken by a Windows PostgreSQL, and mock mode by default

- **Area:** tooling
- **Author:** Cloudcrackamara (+ Claude Code)
- **Symptom:** Setting up the #74 click-through on Windows:
  1. `python -m app.modules.demo.seed` failed with `pydantic_core._pydantic_core.ValidationError:
     1 validation error for Settings database_url Field required`.
  2. `docker compose up -d postgres` failed with `Ports are not available:
     exposing port TCP 127.0.0.1:5432 -> 0.0.0.0:0: listen tcp 127.0.0.1:5432:
     bind: An attempt was made to access a socket in a way forbidden by its
     access permissions.`
  3. With the frontend started by plain `npm run dev`, adding an area and
     saving a fee succeeded instead of showing "not connected".
- **Cause:**
  1. The checkout had no `.env` at the repository root; settings read
     `REPO_ROOT/.env` (`backend/app/core/config.py`).
  2. A local PostgreSQL 18 Windows service (`postgresql-x64-18`) was
     listening on 5432.
  3. With `VITE_USE_MOCKS` unset, `npm run dev` serves mocks
     (`frontend/src/lib/api/mode.ts`), and the mock accepts both.
- **Fix / workaround:**
  1. `cp .env.example .env` at the repository root; remove the empty
     `SESSION_SECRET=` line (development generates one).
  2. Check the port first (`Get-NetTCPConnection -LocalPort 5432`). Stop the
     service while testing (`Stop-Service postgresql-x64-18`, as
     Administrator; `Start-Service` afterwards), or publish the container on
     another port and change `DATABASE_URL` to match.
  3. Start the frontend with `VITE_USE_MOCKS=false npm run dev` (Git Bash) or
     `$env:VITE_USE_MOCKS='false'; npm run dev` (PowerShell). Not in
     `frontend/.env.local`: that breaks `npm test`
     (`2026-10-26-env-local-with-real-api-breaks-frontend-tests.md`).
- **Status:** workaround
- **Refs:** #74, `README.md` (local setup)
