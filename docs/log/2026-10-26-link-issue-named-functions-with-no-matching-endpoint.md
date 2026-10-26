# 2026-10-26: A link issue named fork functions with no matching endpoint

- **Area:** process
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** #19 asked to link `listPayments` and `confirmPayment` (the
  fork's per-order Payments page with "Mark paid") to the admin cash
  endpoints of `docs/api/payments.md`. Those endpoints work per driver
  handover (cash day, receive with a counted total, reconcile); none lists
  orders by payment status or marks one order paid, and the pilot uses
  neither bank transfers nor refunds (F4).
- **Cause:** the linking plan paired functions with endpoints by area
  ("payments") without checking the screens' actions against the contract.
  Wiring "Mark paid" to a remittance would have faked the counting step
  (BR-07).
- **Fix / workaround:** #19 re-scoped by the technical lead: the approved
  admin cash screens K3 to K5 are built in the fork
  (`docs/design/admin-cash.md`), and the Payments page keeps its mocks.
  Before starting a link issue, check each function's actions against the
  contract's endpoints, not just the names.
- **Status:** resolved
- **Refs:** #19, `docs/design/admin-cash.md`, `docs/api/payments.md`
