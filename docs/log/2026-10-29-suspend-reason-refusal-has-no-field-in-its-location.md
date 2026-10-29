# 2026-10-29: The server's "reason too short" refusal names no field, so it showed as a generic message

- **Area:** frontend
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** In the #220 click-through, suspending a rider with the reason
  "no" showed only "Request validation failed" under no field. My tests had
  passed with a refusal at `["body", "reason"]`.
- **Cause:** The suspend reason rule is a check on the whole request body, so
  the server answers `422 validation_error` with
  `details: [{ "loc": ["body"], "msg": "Value error, A reason of at least 5
  characters is required" }]`. There is no `reason` in `loc`, and pydantic puts
  "Value error, " in front of the message. The test body was written from the
  contract's field names, not from a real response.
- **Fix / workaround:** `fieldErrors` in `pages/Riders.tsx` keys a refusal by
  the last element of `loc`, and also by a message that names the reason, and
  drops the "Value error, " prefix, so the words show under the reason field.
  A refusal that names no field shows as the server's own message. The test
  now uses the real shape. When a screen shows a server refusal, read a real
  response first (`curl` or a short script against a local backend), not only
  the contract's examples.
- **Status:** resolved
- **Refs:** #220, `frontend/src/features/admin/pages/Riders.tsx`,
  `frontend/src/features/admin/directory.screens.test.tsx`
