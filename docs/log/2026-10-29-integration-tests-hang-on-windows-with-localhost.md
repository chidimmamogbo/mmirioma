# 2026-10-29: Integration tests hang on Windows when the test database host is `localhost`

- **Area:** backend
- **Author:** Cloudcrackamara + agent
- **Symptom:** `pytest tests/test_dispatch_integration.py` with `TEST_DATABASE_URL=postgresql+asyncpg://...@localhost:5432/<db>` ran the test, printed `PASSED`, then never finished. `faulthandler` showed the process waiting in `psycopg.connect` in the `created` fixture's teardown. A bare `psycopg.connect(...)` to the same URL worked.
- **Cause:** On this Windows machine `localhost` can resolve to `::1` first, while the Docker Postgres container publishes the port on `127.0.0.1` only (`compose.yaml`: `127.0.0.1:5432:5432`). The fixture's sync connection waits instead of falling back.
- **Fix / workaround:** Use `127.0.0.1` in `TEST_DATABASE_URL` (and `DATABASE_URL`). The 1570 backend tests then pass.
- **Status:** workaround
- **Refs:** #243
