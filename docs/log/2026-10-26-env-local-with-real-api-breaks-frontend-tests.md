# 2026-10-26: A local .env.local with the real API made frontend tests fail

- **Area:** frontend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** `npm test` failed 15 tests in 4 files (admin pages,
  VerifyPhone, SignIn, newsletter), for example `TestingLibraryElementError:
  Unable to find role="button" and name "Send code"`, on a branch that changed
  no frontend code. CI passed.
- **Cause:** `frontend/.env.local` (git-ignored) had `VITE_USE_MOCKS=false`,
  left from a click-through against the local backend. Vitest loads
  `.env.local` like Vite does, so the mock-mode tests called the real API,
  which was not running.
- **Fix / workaround:** run the tests with mocks on:
  `VITE_USE_MOCKS=true npm test` (292 passed), or set `VITE_USE_MOCKS=true`
  in `.env.local` after a click-through.
- **Status:** workaround
- **Seen again:** 2026-10-27 (#82 part 3): 18 tests in 4 files failed
  with `.env.local` at `VITE_USE_MOCKS=false`; all 353 passed with
  `VITE_USE_MOCKS=true npm test`. Search the log before debugging a
  frontend test failure on a branch that changes no frontend code.
- **Refs:** #19, #21, `frontend/.env.example`
