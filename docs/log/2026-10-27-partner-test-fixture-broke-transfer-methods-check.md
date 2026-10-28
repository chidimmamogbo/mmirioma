# 2026-10-27: A partner test fixture broke the transfer methods check

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** the first run of the `anonymize-partner` integration test
  (#119) failed with
  `asyncpg.exceptions.CheckViolationError: new row for relation "driver_profiles" violates check constraint "ck_driver_profiles_transfer_methods_values"`.
- **Cause:** the fixture set `transfer_methods=["pump"]`. The column only
  takes the `TransferMethod` values (`ground`, `overhead`, the order's tank
  types; FR-013), enforced by `transfer_methods <@ ARRAY['ground', 'overhead']`.
- **Fix / workaround:** use `["ground", "overhead"]`. When a test builds a
  `DriverProfile` by hand, take values from the model's enums, not
  free text.
- **Status:** resolved
- **Refs:** #119, `backend/app/modules/dispatch/models.py` (`TransferMethod`).
