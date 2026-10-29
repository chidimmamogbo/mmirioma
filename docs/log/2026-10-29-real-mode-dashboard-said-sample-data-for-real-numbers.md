# 2026-10-29: The real-mode dashboard still said SAMPLE DATA

- **Area:** frontend
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** In the #217 click-through on the real backend, the Dashboard
  header showed "SAMPLE DATA" and the Revenue tile said "Delivered orders,
  SAMPLE", although the numbers came from the server.
- **Cause:** The design always drew the tag, because every number in the mock
  is a sample. The type also said `is_sample: true`, so nothing could turn it
  off.
- **Fix / workaround:** `AdminDashboard.is_sample` is a boolean (PR #222) and
  the adapter sets it from the response's `is_simulated`. The Dashboard shows
  the tag, and the Revenue note, only when it is true. Tests:
  `features/admin/operations.screens.test.tsx` (tag with simulated numbers,
  none with real ones). A database with only demo accounts reports
  `is_simulated: false` by default and zero counts: the screens send no
  `simulated` parameter (BR-09).
- **Status:** resolved
- **Refs:** #217, `frontend/src/features/admin/pages/Dashboard.tsx`
