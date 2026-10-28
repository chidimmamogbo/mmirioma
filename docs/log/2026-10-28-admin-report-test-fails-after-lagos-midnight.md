# 2026-10-28: An admin report test fails in the first hours after midnight in Lagos

- **Area:** backend tests
- **Author:** Bonvee120 (+ Claude Code)
- **Symptom:** Backend CI on PR #135 failed although the PR changes no
  backend file: 1 failed, 1413 passed.
  `tests/test_admin_reports_integration.py::test_dashboard_and_report_count_real_or_simulated_never_both`
  failed with `AssertionError: assert (2 - 0) == 3`. The run started at
  23:04 UTC, which is 00:04 on 28 Oct in Africa/Lagos.
- **Cause:** the test creates orders up to 2 hours in the past
  (`window_end=NOW - timedelta(hours=2)`, `created_at=NOW - timedelta(minutes=90)`)
  and then counts the Lagos "today" report. Within about two hours after
  midnight Lagos time, those orders fall on the previous day, so one is
  missing from the count.
- **Fix / workaround:** re-run the failed job once it is past about 02:00
  Lagos time. The lasting fix (pin the test's clock, or create the
  orders at a fixed time of day) belongs to the test's owner; issue
  filed for @nnamdi-security.
- **Status:** workaround
- **Refs:** #102 (part 2, commit `1b48bfb`), PR #135
