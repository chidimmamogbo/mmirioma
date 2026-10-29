# 2026-10-26: The demo seed has no cash records to click through

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** the admin cash screens (#19) can only show an empty day
  against the local backend: `python -m app.modules.demo.seed` creates
  accounts and orders in `quote_requested`, and no cash collections.
- **Cause:** a cash record needs an order confirmed, assigned, delivered
  with unloading complete, and the driver's record (payments.md); the seed
  deliberately invents no later statuses ("would fake an order history").
- **Fix / workaround:** click through the empty day and the errors now;
  test receiving in mock mode. Receiving against the backend needs the
  driver steps (#13) and driver cash (#20) linked, or the API driven by
  hand.
- **Status:** resolved. The seed still has no cash records, by design, but the driver steps (#13) and driver cash (#20) are linked. On 2026-10-29 the end-to-end run delivered an order, recorded the driver's cash, received it and reconciled it against the real backend.
- **Refs:** #19, #13, #20, `backend/app/modules/demo/seed.py`
