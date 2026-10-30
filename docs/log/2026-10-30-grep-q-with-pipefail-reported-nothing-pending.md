# 2026-10-30: `production-migrate.sh --check` said "Nothing pending" with 17 migrations pending

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** with the scratch database at revision 0005 and head 0022, the first version printed `Nothing pending.` and exited 0, so the destructive-change check never ran.
- **Cause:** the test was `if ! printf '%s\n' "$sql" | grep -q 'Running upgrade'`. `grep -q` exits on the first match and closes the pipe; `printf` gets SIGPIPE, and under `set -o pipefail` the pipeline status is 141, so `!` made it true.
- **Fix / workaround:** count instead: `pending="$(printf ... | grep -c 'Running upgrade' || true)"`. Re-tested at 0005 (17 pending), at 0022 (nothing pending) and on an empty database. Avoid `grep -q` at the end of a pipe in scripts that use `pipefail`.
- **Status:** resolved
- **Refs:** #282, `deploy/production-migrate.sh`.
