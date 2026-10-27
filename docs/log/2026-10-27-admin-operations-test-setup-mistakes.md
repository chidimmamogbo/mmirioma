# 2026-10-27: Two mistakes in the first admin operations tests

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:**
  1. `ruff check` failed on the integration test cleanup with
     `S608 Possible SQL injection vector through string-based query construction`
     (nine lines).
  2. `test_holds_tell_admins_once_per_driver_action` failed with
     `duplicate key value violates unique constraint "uq_assignments_live_driver"`.
- **Cause:**
  1. The cleanup built its `DELETE` statements with an f-string holding a
     constant subquery. Ruff cannot tell it is constant.
  2. The test gave one driver two live jobs; a driver may hold only one
     (partial unique index on live assignments).
- **Fix / workaround:**
  1. Spell each statement out as a literal string, as the other fixtures do.
  2. Use a second driver for the second job.
- **Status:** resolved
- **Refs:** #102, `backend/tests/test_admin_operations_integration.py`.
