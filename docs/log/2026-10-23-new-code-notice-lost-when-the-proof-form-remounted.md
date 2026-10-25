# 2026-10-23: "New code sent" was lost because the proof form remounted

- **Area:** frontend
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** Test "A5-h, A5-k: an expired code offers a new one; sent
  shows the new time" failed: `Unable to find an element with the text:
  New code sent`.
- **Cause:** `ActiveJob` rendered `<ProofForm key={job.delivery_code?.issued_at}>`.
  A new code changes `issued_at`, so React threw the form away and mounted a
  new one, losing its "new code sent" state (and anything typed).
- **Fix / workaround:** Removed the key; the form resets only what a new
  code needs (the code field, the expired flag) in the new-code `onSuccess`.
  Do not key a form on server data that changes while the driver uses it.
- **Status:** resolved
- **Refs:** #97, `frontend/src/features/driver-jobs/components/ActiveJob.tsx`
