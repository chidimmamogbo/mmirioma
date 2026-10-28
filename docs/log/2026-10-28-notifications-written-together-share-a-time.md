# 2026-10-28: Two notifications written in one transaction have no defined order

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** the first run of the suspension integration test (#45, part 2)
  failed with
  `AssertionError: assert ['reassigned', 'account', 'assigned'] == ['account', 'reassigned', 'assigned']`,
  although the three notifications were all there.
- **Cause:** suspending a partner takes back an offered job (a `reassigned`
  message) and tells the partner their status changed (an `account` message)
  in one transaction. `created_at` defaults to the database's `now()`, which is
  the transaction's start time, so both rows carry the same time and the list
  ("newest first") puts them in either order. The service was right; the test
  assumed an order.
- **Fix / workaround:** compare the kinds as a sorted list when several
  notifications come from one transaction. Only separate transactions give
  a defined order.
- **Status:** resolved
- **Refs:** #45, `backend/tests/test_admin_drivers_integration.py`,
  `backend/app/modules/notifications/service.py` (`list_for_user`).
