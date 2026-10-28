# 2026-10-28: Reports test fails just after Lagos midnight

- **Area:** backend
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** `tests/test_admin_reports_integration.py::test_dashboard_and_report_count_real_or_simulated_never_both`
  failed locally at 00:09 Lagos time (23:09 UTC):
  `assert report_real.orders.total - report_real0.orders.total == 3` got
  `2 == 3`. It fails the same way on unchanged `main`.
- **Cause:** the test creates one of "today's" orders at `NOW - 90 minutes`
  (UTC), while the "today" report counts the **Lagos** calendar day
  (`lagos_today()`). Between 00:00 and 01:30 Lagos time that order falls on
  the previous Lagos day, so the report counts two, not three. The report is
  right; the test's data depends on the time of day.
- **Fix / workaround:** re-run after 01:30 Lagos time. Proper fix: build the
  test's times from the start of the Lagos day (for example noon Lagos today)
  instead of `datetime.now(UTC)` minus an offset. Not changed here: the test
  belongs to #102 (reports).
- **Status:** open
- **Refs:** #102, #136 (found while running the full suite)
