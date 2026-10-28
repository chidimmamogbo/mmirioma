# 2026-10-28: The report test failed just after midnight in Lagos

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** CI's backend job failed on PR #123 (a frontend-only change)
  at 23:20 UTC, 00:20 in Lagos:
  `FAILED tests/test_admin_reports_integration.py::test_dashboard_and_report_count_real_or_simulated_never_both - AssertionError: assert (2 - 0) == 3`.
  Running `main`'s version locally at 00:21 Lagos time failed the same way.
- **Cause:** the test (#102 part 2) dated its "waiting" order 90 minutes
  before now and its pickup 30 minutes before now. In the first 90 minutes
  after midnight in Lagos those fall on the previous Lagos day, so the
  "today" report no longer counted them. The test assumed now and those
  times were on the same Lagos day.
- **Fix / workaround:** the waiting order is now always from an earlier
  Lagos day (`min(now - 90 min, today's start - 1 min)`), and the report
  is expected to leave it out while the dashboard counts it as open; the
  pickup is never before today began. The fixed test passes at 00:21
  Lagos time. Tests that count "today" must date their rows inside the
  Lagos day, not relative to now.
- **Status:** resolved
- **Refs:** #102, #116, #123, `backend/tests/test_admin_reports_integration.py`.
