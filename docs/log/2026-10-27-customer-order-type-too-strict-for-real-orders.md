# 2026-10-27: The customer order type was too strict for real orders

- **Area:** frontend
- **Author:** Daveoski (+ Claude Code)
- **Symptom:** Linking `createOrder`, `listOrders` and `getOrder` (#9) could
  not keep "pages unchanged". The design's `CustomerOrder` required a full
  `quote` with water and delivery lines, a `choice`, a payment status and an
  address label. The agreed backend sends the total only, `quote: null` for
  a quote request, `null` delivery details on orders sent before #21, and no
  payment status or label. Six screens read `o.quote.water...` and
  `o.choice...` unconditionally, so real orders would have crashed them or
  needed invented values.
- **Cause:** The domain types were written for the mocks, which always
  have every value, before the contracts decided what customers are sent.
- **Fix / workaround:** With the owner's OK, `quote`, `choice`,
  `address_label` and `payment.status` became nullable in
  `frontend/src/domain/orders.ts`. A new `OrderPrice` type holds the total
  plus optional lines, and a new `order_update` stage covers unknown
  statuses. Screens use helpers in `features/customer/orderHelpers.ts`. The
  mocks keep a strict `MockCustomerOrder` (as `StoredJob` does for partner
  jobs), so mock mode is unchanged. Next time, write domain types against
  the contract, not the mock.
- **Status:** resolved
- **Refs:** #9, `docs/api/order-details-and-price.md` (decision 6), `docs/api/orders.md`
