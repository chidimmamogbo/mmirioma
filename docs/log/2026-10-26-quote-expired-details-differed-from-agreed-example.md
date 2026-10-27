# 2026-10-26: quote_expired was built with details the agreed example does not have

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** the first version of `check_quote_for_order` raised 409
  `quote_expired` with `details: {"price_valid_until": ...}` and the message
  "This price has expired. Ask for a new price.". The agreed example
  `docs/api/examples/error-quote-expired.json` has `details: null` and the
  message "This price has expired. Please get a new price.". Found while
  checking the build against the contract, before any test or PR.
- **Cause:** the error was written from the contract's error table, which
  does not show `details`, without opening the example. Adding a field is
  still a contract change.
- **Fix / workaround:** matched the example (no details, the agreed
  message). Check every error and response against `docs/api/examples/`, not
  only the tables.
- **Status:** resolved
- **Refs:** #21, `backend/app/modules/pricing/quotes.py`
