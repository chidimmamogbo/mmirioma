# 2026-10-27: Database container was gone, and `TEST_DATABASE_URL` pointed at the dev database

- **Area:** database
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** with Docker Desktop running and the virtualenv active,
  `python -m app.modules.demo.seed` failed with
  `ConnectionRefusedError: [WinError 1225] The remote computer refused the network connection`.
  Earlier, with Docker Desktop stopped, an integration test run hung until
  it was killed. `docker compose ps -a` listed no container, although the
  volume `mmirioma_postgres_data` still existed. Separately, `.env` set
  `TEST_DATABASE_URL` to the same database as `DATABASE_URL` (`mmirioma`).
- **Cause:** the `postgres` container had been removed (not found which
  way). Docker Desktop running does not start it. Pointing
  `TEST_DATABASE_URL` at the dev database means the integration tests
  delete the seeded demo data there.
- **Fix / workaround:** `docker compose up -d` from the repo root recreated
  `mmirioma-postgres-1` on the existing volume. The data was kept
  (`alembic current`: `0016 (head)`). For tests, created
  `mmirioma_fork_test` and ran `alembic upgrade head` against it, as
  `2026-10-26-fork-checkout-had-no-venv-and-shares-the-database.md` advises,
  then ran the integration tests with `TEST_DATABASE_URL` pointing at it.
  Check `docker compose ps` before running the seed or the tests. Point
  `TEST_DATABASE_URL` in `.env` at `mmirioma_fork_test`.
- **Later the same day:**
  1. With `localhost` in `TEST_DATABASE_URL`, the integration tests ran for
     more than 5 minutes without finishing a test, and the agent killed them
     with `timeout`. With `127.0.0.1` they ran in about 30 seconds, as
     `2026-10-26-alembic-commands-took-minutes-locally.md` says.
  2. A killed run skips the tests' cleanup. One dispatch test left a
     "Sample driver" with a 600 L "Sample tricycle" in
     `mmirioma_fork_test`. The next full run then failed
     `test_keke_takes_any_kind_and_the_smallest_vehicle_in_the_fewest_trips`,
     because the quote picked that 600 L vehicle instead of the test's 700 L
     one. Deleting the leftover driver, profile, vehicle and user fixed it.
     After killing an integration run, check the test database for
     `Sample ...` rows before trusting the next result.
  3. `main` had moved to `0018` (#21), so `mmirioma_fork_test` needed
     `alembic upgrade head` again. Until then the tests failed with
     `column orders.delivery_type does not exist`.
- **Status:** workaround
- **Refs:** #63, `compose.yaml`, `.env.example`
