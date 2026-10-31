# 2026-10-31: directory.screens.test.tsx timed out in its beforeAll twice, locally

- **Area:** frontend
- **Author:** Bonvee120 + agent
- **Symptom:** While adding tests for #294, `npx vitest run src/features/admin/directory.screens.test.tsx` failed twice in a row without running a test. First `Error: [vitest-pool]: Failed to start forks worker ... Timeout waiting for worker to respond`, then `Error: Hook timed out in 10000ms` with `Tests 15 skipped (15)`.
- **Cause:** The file's `beforeAll` imports the whole app after stubbing `fetch` (see its header comment), which takes more than the default 10 s hook time on a busy machine, the same slowness as the page tests that need a longer wait (`WAIT`). No process was running away.
- **Fix / workaround:** Run it with a longer hook time, `npx vitest run src/features/admin/directory.screens.test.tsx --hookTimeout=60000`: 15 passed. CI runs the file normally.
- **Status:** workaround
- **Refs:** #294, `frontend/src/features/admin/directory.screens.test.tsx`
