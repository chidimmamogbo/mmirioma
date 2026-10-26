# 2026-10-26: A request with `"is_available": "yes"` went online

- **Area:** backend
- **Author:** Bonvee120 + Claude Code
- **Symptom:** `test_availability_needs_a_boolean[body1]` failed: `PUT
  /driver/availability` with `{"is_available": "yes"}` answered 200, not 422
  `validation_error`.
- **Cause:** Pydantic's default (lax) mode converts strings such as "yes",
  "true" and "1" to `True`. The contract says a non-boolean is refused.
- **Fix / workaround:** `StrictBool` for `is_available` and the partner
  preferences. Use strict types where the contract says "boolean".
- **Status:** resolved
- **Refs:** #61, `backend/app/modules/partners/schemas.py`
