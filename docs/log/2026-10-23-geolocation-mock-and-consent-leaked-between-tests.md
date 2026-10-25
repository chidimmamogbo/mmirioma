# 2026-10-23: A geolocation mock and the remembered consent leaked between tests

- **Area:** frontend (tests)
- **Author:** Cloudcrackamara + Claude Code
- **Symptom:** "A5-f then A7-a" failed in the full file (`expected last
  "vi.fn()" call to have been called with [ 'MO-ACTIVE0001', … ]`) and
  passed alone: the proof carried a location.
- **Cause:** The earlier arrival test defined `navigator.geolocation` and
  answered "Share location", which `location.ts` remembers per job in a
  module-level map. Both outlived the test, and the proof test used the same
  job reference.
- **Fix / workaround:** `afterEach` sets `navigator.geolocation` back to
  `undefined`, and `readLocationOnce` treats a missing
  `getCurrentPosition` as "no location", so the remembered consent sends
  none. Reset any browser API a test defines.
- **Status:** resolved
- **Refs:** #97, `frontend/src/features/driver-jobs/activeJob.test.tsx`, `location.ts`
