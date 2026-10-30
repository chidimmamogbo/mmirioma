# 2026-10-30: The order history showed "₦0 Earned" with no trips

- **Area:** frontend
- **Author:** Bonvee120 + agent
- **Symptom:** In a click-through of the rider app on the real backend, Order history showed an "Earned ₦0" tile next to Trips and Litres while the period had no trips. Partner pay is out of the MVP, and the code comment above the tile says the figure is left out rather than shown as ₦0.
- **Cause:** `PartnerHistory` (`pages/PartnerShared.tsx`) decided with `list.every((j) => j.earning_minor_units !== null)`. `every` is true for an empty list, so an empty period, and the moment before the history loads, counted as "amounts known" and drew the tile with a total of 0. With jobs and the real API (no amounts) the tile was already hidden.
- **Fix / workaround:** `known` now needs at least one job: `list.length > 0 && list.every(...)`. Tests cover the empty period, jobs without an amount, and jobs with an amount (the mock demo keeps its tile and "Sample amounts." note). The third test first found "Earned" during loading, which was the same bug: wait for the job before asserting.
- **Status:** resolved
- **Refs:** #157, `frontend/src/features/partner/pages/PartnerShared.tsx`, `frontend/src/features/partner/pages/PartnerHistory.test.tsx`
