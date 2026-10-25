# 2026-10-23: A driver job test's `cash` fixture lacked `record_allowed`

- **Area:** frontend (tests)
- **Author:** Bonvee120 + Claude Code
- **Symptom:** After the job schemas gained `cash` for K1 (#124),
  `driverJobs.test.ts > accepts the cash contract additions` failed:
  `Invalid input: expected boolean, received undefined` at
  `cash.record_allowed`.
- **Cause:** The #97 test built `cash` before payments amendment 2 added
  `record_allowed`, and the job schema did not read `cash` yet, so the gap
  was invisible.
- **Fix / workaround:** The fixture now carries `record_allowed`, and the
  test checks the parsed card. Every job fixture also gained `cash: null`.
  When a schema starts reading a field, check the tests' fixtures against
  the agreed contract, not only the code.
- **Status:** resolved
- **Refs:** #124, `frontend/src/lib/api/driverJobs.test.ts`
