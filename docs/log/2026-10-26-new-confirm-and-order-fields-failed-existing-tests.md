# 2026-10-26: New quote fields made 12 existing tests fail

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** after adding quotes (#21), `pytest` failed 3 unit tests and,
  with `TEST_DATABASE_URL`, 9 in `test_confirmation_integration.py`:
  `TypeError: ConfirmInput.__init__() missing 1 required positional argument:
  'expected_status'`; `Extra items in the left set: 'quote'` in
  `test_customer_response_matches_contract`; the example key check in
  `test_confirm_passes_the_request_and_returns_the_detail`; and the
  `expected_status` validation case, whose `awaiting_confirmation` is now
  valid (the error moved to `manual_quote_total_minor_units`).
- **Cause:** expected knock-on of agreed additive changes: `OrderRead.quote`
  (order details contract) and `ConfirmInput.expected_status` for confirming
  quoted orders (question 14).
- **Fix / workaround:** updated the tests and added `"quote": null` to the
  five order examples. The validation case now checks a bad
  `expected_status` and both total rules. Run the integration tests too
  after changing a service input: the unit tests do not build
  `ConfirmInput` directly.
- **Status:** resolved
- **Refs:** #21, `backend/tests/test_confirmation_integration.py`,
  `backend/tests/test_confirmation_api.py`, `backend/tests/test_orders_api.py`
