# 2026-10-29: A new query in the admin order list broke API tests that fake the session

- **Area:** backend
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** After `holds.list_orders` gained a call to
  `dispatch_service.live_drivers_by_order` (#204), five tests failed in the
  full run: `test_orders_api.py::test_admin_list_passes_filters`,
  `test_admin_list_without_filters_means_all`,
  `test_admin_order_includes_customer_and_simulated_flag` and two in
  `test_order_feedback_api.py`, with
  `ConnectionRefusedError: [WinError 1225] The remote computer refused the
  network connection` from `dispatch/service.py` (`live_drivers_by_order`).
  `test_hold_review_api.py` and `test_dispatch_api.py` passed.
- **Cause:** The orders API tests run the real `GET /admin/orders` route with
  a fake session and replace each service call they need
  (`holds.current_holds`, `service.feedback_by_order`, ...). A new query in the
  path is not replaced, so it reached for a real database. The files I ran
  first did not include these tests; only the full run showed it.
- **Fix / workaround:** The `test_orders_api.py` fixture also replaces
  `dispatch_service.live_drivers_by_order` (no live driver). When a route gains
  a service call, run the full backend suite, not only the touched files, and
  grep the tests for how the neighbouring calls are faked
  (`grep -rn "current_holds" backend/tests`).
- **Status:** resolved
- **Refs:** #204, `backend/tests/test_orders_api.py`
