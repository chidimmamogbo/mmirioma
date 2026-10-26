# 2026-10-26: Issue #6 asked to link phone verification screens the fork did not have

- **Area:** process
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** #6 said to link "customer sign-up and Profile (phone)" to the four phone verification endpoints, but the fork had no screen that sends or checks a code. `SignUp.tsx` still said staff verify phones by hand, and the order Review screen promised a call from the team. Against the real backend, an unverified customer could not order at all (403 `phone_not_verified`) and had no way to fix it.
- **Cause:** Fork design decision 7 (`docs/design/handoff-v1.md`) dropped the "Verify phone" screen. It was written before SRS v0.2 FR-003, which requires an SMS code before the first order. The issue was written from the endpoint list, not from the screens.
- **Fix / workaround:** Reused the main repo's approved phone verification design, placed in the fork's screens (`docs/design/phone-verification.md`, approved G2 on 2026-10-26), and built it in #6. Decision 7 is marked superseded. When writing a link issue, check that each screen it names exists and calls the endpoint.
- **Status:** resolved
- **Refs:** #6, `docs/design/phone-verification.md`, `docs/design/handoff-v1.md`
