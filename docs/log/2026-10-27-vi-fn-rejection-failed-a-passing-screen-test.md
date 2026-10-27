# 2026-10-27: A `vi.fn` that rejects failed screen tests whose checks all passed

- **Area:** frontend
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** in the new `PartnerSignup.test.tsx`, `partnerSignup` was mocked
  with `vi.mock('../partnerApi', () => ({ partnerSignup: vi.fn() }))` and
  `mockRejectedValue(new ApiError(...))` (also with
  `mockImplementation(async () => { throw ... })`). All three tests failed
  with only `ApiError: Request validation failed`, pointing at the line that
  built the error. Logging showed the submit finished, `findByText` found the
  expected message, and the page showed it. Vitest gave no "Unhandled
  Rejection" note.
- **Cause:** not pinned down. The screen handles the error through
  TanStack Query's `mutate` with `onError`. With a plain async function in
  the `vi.mock` factory instead of a `vi.fn` spy, the same tests pass, so the
  spy's record of the rejected promise is the likely source.
- **Fix / workaround:** mock the module with a plain function that throws a
  value set per test (`vi.hoisted` holder). Avoid `vi.fn().mockRejectedValue`
  for functions a screen calls through `useMutation`.
- **Status:** workaround
- **Refs:** #80, `frontend/src/features/partner/pages/PartnerSignup.test.tsx`, Vitest 5.0.4
