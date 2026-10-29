# 2026-10-30: npm test ran 81 of 88 test files once

- **Area:** frontend
- **Author:** Bonvee120 + agent
- **Symptom:** On `docs/250-partner-arrival-fields`, `npm test` printed `Test Files 81 passed (81)` and `Tests 875 passed (875)`, with no failure. The repository has 88 test files (`git ls-files` and `find` both count 88). Run again straight after, with nothing changed, it printed `Test Files 88 passed (88)` and `Tests 1009 passed (1009)`.
- **Cause:** unknown. Seven files and 134 tests did not run, with no error shown. The output was filtered to the summary lines, so any worker message was not seen. It resembles `2026-10-25-vitest-one-error-all-tests-passed.md` and `2026-10-26-vitest-workers-timed-out-on-start.md`.
- **Fix / workaround:** Compare the file count in the summary with the number of test files (88 at this commit). A smaller number means the run is incomplete: run it again and keep the full output.
- **Status:** open
- **Refs:** #250, `docs/log/2026-10-29-partnerhome-rider-counts-test-failed-once-in-a-full-run.md`.
