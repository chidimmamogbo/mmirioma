# 2026-10-30: `docker compose run` read the "yes" meant for the script's prompt

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** `echo yes | deploy/production-migrate.sh` took the backup, then stopped with no message and no migration. `set -e` ended the script when `read` hit end of input.
- **Cause:** the earlier `alembic current` call ran through `docker compose run -T`, which still reads the script's standard input and consumed the piped answer.
- **Fix / workaround:** the helper function now runs `... </dev/null`. Re-tested: `yes` runs the upgrade, and no answer cancels.
- **Status:** resolved
- **Refs:** #282, `deploy/production-migrate.sh`.
