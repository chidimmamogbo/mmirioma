# 2026-10-23: The Termii wallet ran out during the SMS live test

- **Area:** backend (SMS provider)
- **Author:** nnamdi-security + Claude Code
- **Symptom:** In the first live test (#102),
  `python -m app.modules.messaging.live_test --to <team phone> --send`
  printed "accepted by Termii" for five messages and, for the sixth,
  `payment_part_paid  NOT accepted: Termii returned HTTP 402`. Five
  messages arrived; that one did not.
- **Cause:** The Termii wallet had run out of credit (checked on the Termii
  dashboard by the technical lead). Termii's error page does not list
  HTTP 402; it lists "Insufficient balance: Wallet balance is not
  sufficient to perform that particular transaction." among its common
  errors. The app reports only the HTTP status, not Termii's message
  (technical lead decision, 2026-10-23: keep it that way).
- **Fix / workaround:** Top up the wallet, then resend only that message
  with `--only payment_part_paid`. Before the pilot, keep enough credit for
  every customer's verification code, confirmation, dispatch, delivery code
  and payment message, and check the balance before each delivery day: with
  no credit, no verification or delivery code reaches a customer. The app
  never reports a refused message as sent.
- **Status:** resolved (the wallet was topped up on 2026-10-24; the resent
  message was accepted and received)
- **Refs:** #102, `docs/process/pilot-plan.md` ("SMS live test record")
