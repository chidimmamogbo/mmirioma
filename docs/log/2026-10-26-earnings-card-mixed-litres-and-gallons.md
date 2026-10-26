# 2026-10-26: Partner earnings card added litres to gallons

- **Area:** frontend
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** Found while working on #25. The partner earnings card summed each delivered job as `can_size_litres × can_count` for Keke and `tank_size_gallons` for Tanker, then showed one number labelled "Litres" or "Gallons" by vehicle type. Keke 600 L plus a 750 gal tanker job read as 1,350.
- **Cause:** Two units added in one `reduce` in `PartnerShared.tsx`, with no shared conversion.
- **Fix / workaround:** `totalLitres()` in `features/partner/jobHelpers.ts` counts every job in litres (gallons × 4, FR-021); the card shows the lead unit with the other beside it. Regression test in `partnerHelpers.test.ts`. Use `domain/quantity.ts` for every unit conversion.
- **Status:** resolved
- **Refs:** issue #25, `frontend/src/features/partner/pages/PartnerShared.tsx`
