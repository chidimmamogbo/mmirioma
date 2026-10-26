# 2026-10-25: One Vitest run reported "Errors 1 error" with every test passing

- **Area:** frontend (tests)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** After copying the main repo's API clients and tests into the fork, the first `npm test` ended with `Tests 192 passed (192)` and `Errors 1 error`. The run printed no details of the error.
- **Cause:** unknown. The next full run, with no code change, passed 27 files and 213 tests with no errors, so one test file most likely failed to load on a busy machine. The 21-test difference matches one file's tests.
- **Fix / workaround:** Rerun `npm test`. If it comes back, run `npm test > vt.log 2>&1` and search the log for `Unhandled` to see which file it was.
- **Status:** open
- **Refs:** PR #4, `frontend/src/lib/api/*.test.ts`
