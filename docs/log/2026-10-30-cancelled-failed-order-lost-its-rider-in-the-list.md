# 2026-10-30: A cancelled failed order lost its rider in the order lists

- **Area:** backend
- **Author:** Bonvee120 + agent
- **Symptom:** In a click-through, the dashboard's Recent orders showed Rider "None yet" for an order whose delivery had failed and that the dispatcher then cancelled, while the order panel said "Demo Driver". Issue #275 first blamed the dashboard and said the Orders list showed the driver for the same order.
- **Cause:** The first diagnosis was wrong. The dashboard uses the same data as the Orders page. The Orders list had shown "Demo Driver" only while the order was still `failed`; I looked at the dashboard after the cancel and compared two different moments. The real cause is in `listed_drivers_by_order` (`dispatch/service.py`): a `completed` assignment names its driver only when the order status is in `_ENDED_WITH_DRIVER`, which was `(DELIVERED, FAILED)`. Cancelling a failed order leaves its assignment `completed` and makes the order `cancelled`, so the list dropped the driver while the detail (`_latest_assignment`) kept naming it. I also first proposed adding `DISPUTED`, but the agreed #243 amendment gives `disputed` null, so it stays out.
- **Fix / workaround:** `_ENDED_WITH_DRIVER` now includes `CANCELLED`. The test for ended orders covers a failed order that is then cancelled (names the driver) and a disputed one (names nobody). Issue #275 was edited to say so. Lesson: check which moment a screenshot belongs to before blaming a screen, and read the agreed contract before extending a rule.
- **Status:** resolved
- **Refs:** #275, #243, `backend/app/modules/dispatch/service.py`, `backend/tests/test_dispatch_integration.py`
