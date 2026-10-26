# 2026-10-23: Tests could pick up real Termii settings from `.env`

- **Area:** backend (tests)
- **Author:** chidimmamogbo + Claude Code
- **Symptom:** For the #102 live SMS test, the developer set
  `SMS_PROVIDER=termii` with a real key in the repository-root `.env`.
  `get_settings()` in the test process then returned `termii`: the test
  suite would have used the real provider wherever a test does not swap in
  the mock (only three test files override `get_sms_provider`). Found
  before any test ran with it; no SMS was sent.
- **Cause:** `Settings` reads `.env`, and `tests/conftest.py` pinned
  `APP_ENV`, `DATABASE_URL` and `FRONTEND_URL` but not `SMS_PROVIDER`.
- **Fix / workaround:** `conftest.py` now sets `SMS_PROVIDER=mock`
  (environment variables take precedence over `.env`).
  `test_tests_use_the_mock_provider_whatever_the_local_env_says` guards it.
  Any new real-world provider setting (Paystack, email) must be pinned to
  its test value in `conftest.py` the same way.
- **Status:** resolved
- **Refs:** #102, `backend/tests/conftest.py`, `backend/tests/test_sms_live_test.py`
