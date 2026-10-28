# 2026-10-29: The two #209 panel tests failed on `main` between midnight and mid-morning in Lagos

- **Area:** frontend
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** After merging `main` into the #204 branch, two tests failed with
  `Unable to find role="button" and name "Fail this delivery"` (and the held
  order's "Review"): "keeps the panel on the failed order when the address
  names none" and "keeps the panel on the held order after a hold decision
  when the address names none" (#209, PR #212). They also failed on a clean
  checkout of `main`. They had passed the evening before.
- **Cause:** The tests rely on the order they set up being the first row of the
  admin list, which the mock sorts by creation time, newest first. The seed's
  "today" jobs are dated at fixed Lagos hours (`lagosToday(11, 20)`), so
  between midnight and about 11:00 they are in the future and sort ahead of
  the order the test expects. For a job that also has a customer order, the
  list uses the customer order's time.
- **Fix / workaround:** The tests give their order a creation time a day ahead
  (`NEWEST()`, on the job and on its customer order). They now pass at any
  hour; a test that depends on list order should set the times it depends on.
- **Status:** resolved
- **Refs:** #209, #204, `frontend/src/features/admin/admin.test.tsx`
