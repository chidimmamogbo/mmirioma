# 2026-10-29: Raising a support request through the API needs a UUID `idempotency_key`

- **Area:** tooling
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** A setup script for the #219 click-through got `422
  validation_error` from `POST /api/v1/me/support-requests`: first
  `idempotency_key: Field required`, then (with a plain string) `Input should
  be a valid UUID, invalid character: found 'l' at 1`.
- **Cause:** The create body needs an `idempotency_key` that is a UUID
  (`docs/api/customer-account.md`, "Support requests"); the example in the
  contract has it, a hand-written body does not.
- **Fix / workaround:** Send `{ "type", "message", "order_reference",
  "idempotency_key": "<uuid>" }`. To get requests to resolve in a local
  click-through, sign in as the demo customer (`08000090011`), post two with
  different UUIDs, then use the admin Support page.
- **Status:** resolved
- **Refs:** #219, `docs/api/examples/support-request-create-request.json`
