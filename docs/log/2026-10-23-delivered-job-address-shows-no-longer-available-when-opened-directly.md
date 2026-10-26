# 2026-10-23: A delivered job's address shows "no longer available" when opened directly

- **Area:** frontend
- **Author:** Bonvee120 + Claude Code
- **Symptom:** Two K1 tests that opened `/driver/jobs/MO-1042` for a
  delivered job failed: `Unable to find role="region" and name "Cash"` (and
  "Job outcome"). The page showed the offer's "no longer available" state.
- **Cause:** A delivered job's own address answers 404. The job page shows
  the outcome (A7) only when it knows the job was accepted, from a job it
  had loaded or from My jobs' router state `{ accepted: true }`; opened cold,
  a 404 reads as a lost offer (#97 behaviour, unchanged here).
- **Fix / workaround:** The tests open the job as My jobs does, with
  `{ accepted: true }`. The Record cash page does not depend on it: it reads
  the job from today's `done` summary. A driver who bookmarks a delivered
  job's address still sees "no longer available"; noted in
  `docs/features/driver-cash.md`.
- **Status:** workaround
- **Refs:** #124, #97, `frontend/src/features/driver-cash/recordCash.test.tsx`
