# 2026-10-23: The frontend test suite failed once (27 tests) and then passed three times

- **Area:** frontend (tests)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** One `npm test` run failed 27 tests in 7 files that the change
  under test did not touch: `admin-cash/cash.test.tsx` (K4),
  `admin-confirmation/confirmation.test.tsx` (C1), `admin-holds/holds.test.tsx`
  (R0, R1, R3), `admin-orders/AdminOrderDetailPage.test.tsx`,
  `admin-orders/AdminOrdersPage.test.tsx`,
  `customer-orders/customerOrders.test.tsx` (O1, O2) and
  `phone-verification/phoneVerification.test.tsx` (V3). Rerun alone, two
  of those files passed; the full suite then passed three times in a row
  (605 of 605). The failing run's error messages were not kept.
- **Cause:** unknown. It ran just after a 10-minute end-to-end run and a
  backend shutdown on the same machine; load-related timeouts are possible
  but were not confirmed.
- **Fix / workaround:** None yet. If it happens again, keep the full output
  (`npm test > test.log 2>&1`) and look for `Test timed out` or a shared
  date or time in the failing tests.
- **Status:** open
- **Refs:** #97 (state tests and end-to-end run branch)
