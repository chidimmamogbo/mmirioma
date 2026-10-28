# 2026-10-28: A click-through that needs saved data should not use the dev database

- **Area:** tooling
- **Author:** Bonvee120 + agent
- **Symptom:** The #173 click-through needs a saved price list, and price list versions cannot be deleted, so seeding one in the dev database would leave it there for good. A second Vite server on port 5174 also failed with `Error: Port 5174 is already in use` (another project's server, which answered `curl`).
- **Cause:** The dev backend (port 8000) and Vite (port 5173) use the dev database, and other projects on the machine may hold nearby ports.
- **Fix / workaround:** Create a throwaway database next to the dev one (`CREATE DATABASE mmirioma_test_173`, `CREATE EXTENSION postgis`, `alembic upgrade head`), seed an admin, zones and versions in-process with the services, run a second backend with `DATABASE_URL` and `FRONTEND_URL` set for it (port 8001), and a second Vite with `VITE_API_BASE_URL=http://localhost:8001 VITE_USE_MOCKS=false` on a free port (`--strictPort`, here 5191). The backend's `FRONTEND_URL` must be that exact origin, or CORS refuses the page. Afterwards stop only the servers you started, drop the database (`DROP DATABASE ... WITH (FORCE)`) and delete the throwaway password. Do not stop a server you did not start.
- **Status:** workaround
- **Refs:** #173, `docs/process/local-quote-setup.md`
