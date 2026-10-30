# 2026-10-30: `deploy/backup.sh` has no execute bit, so a wrapper could not run it

- **Area:** tooling
- **Author:** nnamdi-security + agent
- **Symptom:** `deploy/production-backup.sh: line 30: .../deploy/backup.sh: Permission denied`. `git ls-files -s deploy/` shows mode `100644` for `backup.sh` and `restore.sh`.
- **Cause:** the scripts were committed without the execute bit (their own usage lines say `deploy/backup.sh`).
- **Fix / workaround:** the production wrapper calls `bash deploy/backup.sh`, and the runbook uses `bash deploy/restore.sh`. The bit was not changed on the existing scripts. New scripts (`prod.sh`, `production-*.sh`) are committed as `100755`, and `test_deployment_config.py` checks the bit.
- **Status:** workaround
- **Refs:** #282, `deploy/production-backup.sh`.
