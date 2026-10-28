# 2026-10-28: The Service areas screen says the list is a sample, also in real-API mode

- **Area:** frontend
- **Author:** Bonvee120 + agent
- **Symptom:** During the #111 click-through against the local backend (`VITE_USE_MOCKS=false`), `/admin/areas` listed the real "Demo zone" but still showed a SAMPLE tag and the line "The area list is a sample until the first service zone is confirmed (PRD §13.1)."
- **Cause:** `Areas.tsx` shows that footer in every mode. It was written for the mock list, and linking the screen (#74, #111) did not change it. With the real API the list is not a sample.
- **Fix / workaround:** the footer is now `SampleListNote`, shown only when the list is the mock's (`USE_MOCKS`), so with the real API the screen says nothing about a sample. The wording is unchanged and not new, so it needs no G2 for wording; the G2 reviewer only confirms that dropping the line in real mode is right. Tests cover both cases.
- **Status:** resolved
- **Refs:** #111, `frontend/src/features/admin/pages/Areas.tsx`
