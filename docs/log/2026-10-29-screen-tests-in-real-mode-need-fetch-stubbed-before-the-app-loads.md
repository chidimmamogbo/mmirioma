# 2026-10-29: Screen tests in real-API mode need `fetch` and the base URL set before the app loads

- **Area:** frontend
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** The first real-mode screen tests for #217 all failed with
  `Unable to find an element with the text: ...`: every page showed the
  sign-in screen. Stubbing `fetch` with `vi.stubGlobal` in `beforeEach` made
  no difference. After that, assertions failed with `Found multiple elements
  with the text: Sample Driver One`.
- **Cause:** `lib/api/client.ts` binds `globalThis.fetch` and reads
  `VITE_API_BASE_URL` when it is first imported, so a stub installed later is
  never used, and without a base URL the shared client reports "not
  configured". Wide screens also draw the same name twice (table and cards).
- **Fix / workaround:** `operations.screens.test.tsx` mocks `lib/api/mode`
  (`USE_MOCKS: false`), installs the `fetch` stub and
  `vi.stubEnv('VITE_API_BASE_URL', ...)` in `beforeAll`, and only then imports
  `app/providers` and `app/router` dynamically. The stub answers by path from
  a `bodies` object the tests change. Use `findAllByText` where a name appears
  in more than one place. Use this file as the pattern for other real-mode
  screen tests.
- **Status:** resolved
- **Refs:** #217, `frontend/src/features/admin/operations.screens.test.tsx`
