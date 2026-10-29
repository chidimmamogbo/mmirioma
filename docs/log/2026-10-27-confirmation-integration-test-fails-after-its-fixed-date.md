# 2026-10-27: Confirmation integration test fails once its fixed date has passed

- **Area:** backend
- **Author:** nnamdi-security (+ agent)
- **Symptom:** while reviewing PR #151, `pytest` with `TEST_DATABASE_URL` set
  failed one test, on the PR branch and on `main` alike:
  `tests/test_confirmation_integration.py:304: AssertionError: assert [(<OrderStatu...sted'>, None)] == [(<OrderStatu...rmed'>, None)]`
  (`test_confirm_writes_both_events_the_snapshot_and_sends_the_sms`). CI on
  #151 was green because it ran on 2026-10-24.
- **Cause:** the test pins `NOW = 2026-10-26 13:21 UTC` and backdates
  `orders.created_at` to `NOW - 4h`, but the order's creation `OrderEvent`
  keeps the real database clock. The events are read
  `order_by(OrderEvent.created_at, OrderEvent.id)`, so once the real date is
  past `NOW` the creation event sorts after the two confirmation events and
  `events[1:]` picks the wrong rows. Latent since #113.
- **Fix / workaround:** already fixed on `main` by PR #34 before this was
  written up (see `2026-10-26-confirmation-test-failed-after-its-fixed-clock.md`):
  the `new_order` fixture pins the creation event's `created_at` to the same
  `NOW - 4 hours` as the order. This entry was written while reviewing #151,
  on a branch that did not have the fix yet. Tests that mix a fixed test clock
  with database `now()` defaults should pin every row they compare by time.
- **Status:** resolved
- **Refs:** #113 (commit `c3570de`), #151,
  `backend/tests/test_confirmation_integration.py` lines 72, 164 and 284-304.
