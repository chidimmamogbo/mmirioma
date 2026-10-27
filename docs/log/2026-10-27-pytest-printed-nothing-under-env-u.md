# 2026-10-27: Backend pytest run printed nothing and exited 0

- **Area:** tooling
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** from Git Bash on Windows, with `backend/.venv` activated,
  `env -u TEST_DATABASE_URL pytest -q 2>&1 | tail -6` printed nothing.
  `env -u TEST_DATABASE_URL python -m pytest -q > file 2>&1` also exited 0
  and left the file empty. No test result was shown, so the run proved
  nothing.
- **Cause:** unknown. `python -m pytest -q tests/test_demo_seed.py` without
  `env -u` printed results normally in the same shell.
- **Fix / workaround:** clear the variable with `unset TEST_DATABASE_URL`
  instead of `env -u`, then run
  `python -m pytest -q -p no:cacheprovider 2>&1 | tail -4`. That printed
  `871 passed, 151 skipped`. Treat an empty pytest output as a failed run,
  never as a pass.
- **Status:** workaround
- **Refs:** #63
