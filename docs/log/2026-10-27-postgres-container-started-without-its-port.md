# 2026-10-27: The local Postgres container started without publishing its port

- **Area:** database (local)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** After Docker Desktop started, `docker compose up -d postgres` reported the container `Up (healthy)`, but `alembic` and the sources CLI failed with `ConnectionRefusedError: [WinError 1225] The remote computer refused the network connection`, on `localhost` and on `127.0.0.1` alike. `docker ps` showed the container's ports as `5432/tcp` only, without `127.0.0.1:5432->5432/tcp`. Its log also said `PostgreSQL init process complete`: the database was new and empty.
- **Cause:** Another project's container (`schoolflow-db-1`) held `127.0.0.1:5432` when MmiriOma's container started, so the port was not published; the other container then exited. The data volume had been removed earlier, so Postgres initialized an empty database.
- **Fix / workaround:** `docker compose up -d --force-recreate postgres` published the port; `alembic upgrade head` then ran all 18 migrations. Before starting, check `docker ps -a` for other containers on port 5432 and stop them. Load the demo data again after a fresh database (`python -m app.modules.demo.seed`), and see `docs/process/local-quote-setup.md` for quote data. Also set `DATABASE_URL` to `127.0.0.1` rather than `localhost` (IPv6 is tried first; see the LOG.md entry on it).
- **Status:** resolved
- **Refs:** `compose.yaml`, `docs/process/local-quote-setup.md`
