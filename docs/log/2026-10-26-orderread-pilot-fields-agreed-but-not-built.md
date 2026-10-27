# 2026-10-26: OrderRead's #99 fields are agreed but not built in the fork

- **Area:** backend
- **Author:** nnamdi-security (+ Claude Code)
- **Symptom:** `order-details-and-price.md` and `orders.md` ("Customer pilot
  changes (#99)", agreed 2026-10-24) describe `delivery_window`, `price` and
  `water_category` on `OrderRead`, but the fork's `OrderRead`
  (`backend/app/modules/orders/schemas.py`) has none of them.
- **Cause:** the fork's backend was copied from the main repo at `adc8654`,
  before that change was built; the contract came over with the docs.
- **Fix / workaround:** not built in #21 (out of its scope). Customer
  linking (#9) needs them to show a confirmed order's window, price and
  category; raise a backend issue for the #99 fields before #9 links the
  order detail.
- **Status:** open
- **Refs:** #21, #9, `docs/api/orders.md#customer-pilot-changes-99`
