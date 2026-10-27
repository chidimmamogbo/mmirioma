# 2026-10-27: Partner sign-up screen hides a validation error it has no field for

- **Area:** frontend
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** While planning the #67 sign-up adapter, the agent proposed
  sending an unknown service area back as 422 `validation_error` on
  `service_area` and said the screen would show it as its top notice. It
  would have shown nothing. `PartnerSignup.tsx` hides the top notice whenever
  the code is `validation_error` or `phone_already_registered` (`fieldLevel`).
  Its `applyServerFieldErrors` map also covers only `name`, `phone`,
  `password`, `plate` and `tank_gallons`. A `validation_error` about any other
  field (`service_area`, `vehicle_type`, or the contract's `service_zone_id`
  and `declared_capacity_gallons`) leaves the form with no message.
- **Cause:** the screen was built against the mock, which only returns field
  errors for the mapped fields. The contract's field names differ from the
  form's.
- **Fix / workaround:** the adapter (`features/partner/real/account.ts`)
  renames the contract fields in `details.loc` to the form's names
  (`declared_capacity_gallons` becomes `tank_gallons`). It reports an
  unmatched or refused zone with a client-only code,
  `service_area_not_served`, which the screen shows as its top notice. Agreed
  with Bonvee120 for #67. Adding `service_area` to the screen's field map
  would be cleaner, but that is a screen change.
- **Status:** workaround
- **Refs:** #67, `frontend/src/features/partner/pages/PartnerSignup.tsx`
