# 2026-10-23: Frontend tests time out on some runs of the full suite

- **Area:** frontend (tests)
- **Author:** Daveoski + Claude Code
- **Symptom:** On #125's K6 work, `npm test` failed on some runs with
  `Error: Test timed out in 5000ms.` in files the change did not touch
  (`AdminOrdersPage.test.tsx`, the driver jobs and phone verification
  tests, among others), and passed on the next run. Clean `main` (41 files,
  507 tests) did the same: 23 failures on one run, none on the next.
- **Cause:** Load, not a bug in the tests: Vitest runs one jsdom worker per
  file in parallel, and with the driver screens' tests the suite now has 40+
  heavy files. On a busy machine some tests that render whole pages pass
  5 s. CI has passed so far.
- **Fix / workaround:** Rerun once; with this change the suite passed three
  parallel runs in a row and one run with `npx vitest run
  --no-file-parallelism` (517 tests, about 97 s). Keep new component tests
  light (one change event instead of `user.type`, see LOG.md 2026-10-23).
  A lasting fix (a longer `testTimeout` for jsdom files, or fewer workers)
  is a test configuration change for the team to agree.
- **Status:** open
- **Refs:** #125, `frontend/vite.config.ts`
