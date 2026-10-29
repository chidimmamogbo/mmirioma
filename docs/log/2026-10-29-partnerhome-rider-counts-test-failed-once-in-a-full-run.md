# 2026-10-29: PartnerHome rider-counts test failed once in a full run

- **Area:** frontend
- **Author:** Bonvee120 + agent
- **Symptom:** `npm test` (88 files, 173 s) failed one test: `partner home without partner pay (#157) > shows the rider real counts, no earnings and no tile left at "…"` in `src/features/partner/pages/PartnerHome.test.tsx`. 995 passed. The same file run alone passed all 4 tests.
- **Cause:** unknown. The run was slow (workers spawn at about 3 s each), so a wait inside the test probably timed out under load. The failure text was not captured.
- **Fix / workaround:** none needed for #241, which does not touch this file. If it fails again, run the file alone, and capture the assertion message before re-running.
- **Status:** open
- **Refs:** #241.
