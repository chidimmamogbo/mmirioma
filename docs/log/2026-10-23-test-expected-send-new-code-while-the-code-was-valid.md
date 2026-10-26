# 2026-10-23: A test expected "Send new code" while the code was still valid

- **Area:** frontend (tests)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** "A5-i and A5-j" failed: `Unable to find role="button" and
  name "Send new code"`.
- **Cause:** My test, not the screen: it gave the job a valid, sent code and
  `request_new_code` in `allowed_actions`. The contract offers
  `request_new_code` only when a new code would be accepted (expired, used
  up or not sent), and the screen offers the button in those banners only.
- **Fix / workaround:** Split it: A5-i starts from an expired code, A5-j
  from a code whose SMS failed. Build test jobs the server could really
  send.
- **Status:** resolved
- **Refs:** #97, `frontend/src/features/driver-jobs/activeJob.test.tsx`
