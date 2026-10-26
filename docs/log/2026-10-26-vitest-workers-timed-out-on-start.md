# 2026-10-26: Vitest skipped test files when workers timed out on start

- **Area:** frontend (tests)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** `npm test` ended with `Test Files 26 passed (26)`, `Tests 195 passed` and `Errors 3 errors`, exit code 1. Each error read `[vitest-pool]: Failed to start forks worker for test files .../src/mocks/admin.test.ts` (also `mocks/partner.test.ts`, `features/admin/admin.test.tsx`), caused by `[vitest-pool-runner]: Timeout waiting for worker to respond`. Those three files never ran.
- **Cause:** On a busy Windows machine each worker takes several seconds to start (the run prints about 8 s per file), and Vitest gives up on workers that do not answer in time. No test failed. This is the cause of the 2026-10-25 "Errors 1 error" entry.
- **Fix / workaround:** Rerun `npm test`; the next full run passed 29 files and 231 tests. Count the `Test Files` line against the number of test files, so a skipped file is not mistaken for a pass. If it keeps happening, propose fewer workers (`--maxWorkers`) as a separate change.
- **Status:** workaround
- **Refs:** issue #5, `frontend/vite.config.ts`
