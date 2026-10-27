# 2026-10-27: Report test fixtures hit the cash collection constraints

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** the first run of `tests/test_admin_reports_integration.py`
  (#102 part 2) failed with
  `asyncpg.exceptions.CheckViolationError: new row for relation "cash_collections" violates check constraint "ck_cash_collections_received_fields_match_status"`.
  After that fix, `assert (1 - 1) == 1` on the `sources_not_usable` delta.
- **Cause:**
  1. The fixture inserted a `reconciled` collection without the remittance
     fields. `received_fields_match_status` and
     `reconciled_fields_match_status` require `remittance_id`,
     `remitted_at`, `received_by`, `reconciled_at` and `reconciled_by`, and
     a 999-kobo amount would also break `amount_whole_naira`.
  2. The test added its water source before taking the "before" snapshot.
- **Fix / workaround:** insert a `cash_remittances` row and fill the five
  fields for reconciled cash, use whole-naira amounts (`99_900`), and take
  the snapshot before adding rows. The shared cleanup fixture now also
  deletes `cash_collections` and `cash_remittances`.
- **Status:** resolved
- **Refs:** #102, `backend/app/modules/payments/models.py` (constraints).
