# 2026-10-29: PartnerHome rider-counts test fails in full runs

- **Area:** frontend
- **Author:** Bonvee120 + agent
- **Symptom:** `npm test` (88 files, about 173 s) failed one test three times, in separate full runs: `partner home without partner pay (#157) > shows the rider real counts, no earnings and no tile left at "…"` in `src/features/partner/pages/PartnerHome.test.tsx`. Each time every other test passed, and the same file run alone passed all 4 tests. The third time the message was kept: `TestingLibraryElementError: Unable to find an element with the text: /^\d+ trips?$/`.
- **Cause:** the test used `findByText` with the default 1 second wait. Under load (workers spawn at about 3 s each) the lazy page had not rendered in that time. Found on the third failure, while working on #250.
- **Fix / workaround:** the three `findByText` waits in the `#157` tests now use a 10 second timeout (`WAIT`), as other screen tests do.
- **Status:** resolved
- **Refs:** #241, #249, #250.
