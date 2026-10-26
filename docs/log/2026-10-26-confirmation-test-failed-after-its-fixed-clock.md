# 2026-10-26: Confirmation test started failing once the real clock passed its fixed `NOW`

- **Area:** CI
- **Author:** Cloudcrackamara (+ Claude Code)
- **Symptom:** the backend CI job failed on docs-only PR #34 (twice) and on
  PR #33, while PRs #28 and #32 had passed earlier the same day:
  `FAILED tests/test_confirmation_integration.py::test_confirm_writes_both_events_the_snapshot_and_sends_the_sms - AssertionError: assert [(<OrderStatu...sted'>, None)] == [(<OrderStatu...rmed'>, None)]`
- **Cause:** the test clock is `NOW = 2026-10-26 13:21 UTC`. The fixture
  `new_order` wrote the order's `quote_requested` event with the database
  default `created_at` (`now()`, the real time), while confirmation writes its
  two events at `NOW` (`occurred_at`). Before 13:21 UTC on 2026-10-26 the
  creation event sorted first; after it, it sorted after the confirmation
  events and the order check failed. A time bomb, not a flake.
- **Fix / workaround:** the fixture now pins the creation event's
  `created_at` to the same `NOW - 4 hours` as the order. Tests that mix a
  fixed test clock with database `now()` defaults should pin every row they
  compare by time.
- **Status:** resolved
- **Refs:** PR #34, `backend/tests/test_confirmation_integration.py`
