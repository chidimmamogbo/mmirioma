# 2026-10-27: The dispatch link issue mapped "Cancel this order" to withdraw

- **Area:** process
- **Author:** Cloudcrackamara (+ Claude Code)
- **Symptom:** #16 listed `cancelOrder` (withdraw) among its functions. The
  admin order page's "Cancel this order" cancels the whole order ("The rider
  and the customer are told. A paid order becomes a refund"), while
  `POST /admin/orders/{reference}/withdraw` only takes the job back from a
  driver and returns the order to `confirmed`. The page has no withdraw
  control. Two eligible-rider fields had no source either: the dispatch
  driver's vehicle type is free text (`"Tanker truck"`), not `keke` or
  `tanker`, and service areas are not checked by the backend.
- **Cause:** the issue paired functions with endpoints by name, as in
  `2026-10-26-link-issue-named-functions-with-no-matching-endpoint.md`.
- **Fix / workaround:** decided with the lane owner: `cancelOrder` stays not
  connected and goes with the cancellation transition in #17; withdraw waits
  for a screen issue. `EligibleRider.vehicle` and `works_in_area` became
  nullable, and the page shows no vehicle word when it is `null` (it would
  otherwise read "Tanker"). Before starting a link issue, compare each
  button's promise with what the endpoint does.
- **Status:** workaround
- **Refs:** #16, #17, `docs/api/deliveries.md` ("Admin dispatch endpoints"),
  `frontend/src/features/admin/real/ordersDispatch.ts`
