"""The customer's confirmed price, window and category on a real database (#165).

Contract: docs/api/orders.md, "Customer pilot changes (#99)". An order is
confirmed with the real confirmation service (reusing the fixtures of
test_confirmation_integration.py), then read back as the customer sees it.
Covers: null fields before confirmation; the snapshot's price, the order's
window and the category after it; the category label staying frozen while the
supported uses are read live; and the staff views not carrying the fields.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
"""

import pytest
from sqlalchemy import update

from app.modules.messaging.sms import MockSmsProvider
from app.modules.orders import service as orders_service
from app.modules.orders.schemas import OrderRead
from app.modules.sources.models import WaterCategory
from tests import test_deliveries_integration as part1
from tests.test_confirmation_integration import (
    WINDOW_END,
    WINDOW_START,
    confirm,
    delete_own_rows,
    ready,
    request,
    vehicle_ids,
)
from tests.test_deliveries_integration import TEST_DATABASE_URL, Created, Sessions, run

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created = part1.created
# Fixtures imported from test_confirmation_integration.py so this module can use them.
__all__ = ["delete_own_rows", "vehicle_ids"]


async def customer_view(sessions: Sessions, reference: str, customer_id: object) -> OrderRead:
    async with sessions() as session:
        order = await orders_service.get_customer_order(
            session,
            customer_id=customer_id,  # type: ignore[arg-type]
            reference=reference,
        )
        lookups = await orders_service.read_lookups(
            session, [order], with_feedback=True, with_confirmed=True
        )
        return OrderRead.from_order(order, lookups)


def test_an_unconfirmed_order_has_no_window_price_or_category(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s, _, order = await ready(sessions, created)
        view = await customer_view(sessions, order.reference, s.customer.id)
        assert (view.delivery_window, view.price, view.water_category) == (None, None, None)

    run(scenario)


def test_a_confirmed_order_shows_its_manual_price_window_and_category(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s, potable, order = await ready(sessions, created)
        await confirm(sessions, s, order, request(potable, s), MockSmsProvider())

        view = await customer_view(sessions, order.reference, s.customer.id)
        assert view.status.value == "confirmed"
        assert view.price is not None
        assert (view.price.total_minor_units, view.price.currency, view.price.manual) == (
            4_500_000,
            "NGN",
            True,
        )
        assert view.delivery_window is not None
        assert (view.delivery_window.start_at, view.delivery_window.end_at) == (
            WINDOW_START,
            WINDOW_END,
        )
        assert view.water_category is not None
        assert view.water_category.label == "Potable Water"
        # A manual quote has no server quote; the quote field stays the pre-confirmation price.
        assert view.quote is None

    run(scenario)


def test_a_renamed_category_keeps_its_label_but_shows_its_current_uses(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        s, potable, order = await ready(sessions, created)
        await confirm(sessions, s, order, request(potable, s), MockSmsProvider())
        async with sessions() as session:
            original = await session.get(WaterCategory, potable.id)
            assert original is not None
            old_uses, old_label = original.supported_uses, original.label
            try:
                await session.execute(
                    update(WaterCategory)
                    .where(WaterCategory.id == potable.id)
                    .values(label="Renamed Water", supported_uses="Updated uses text")
                )
                await session.commit()
                view = await customer_view(sessions, order.reference, s.customer.id)
            finally:
                await session.execute(
                    update(WaterCategory)
                    .where(WaterCategory.id == potable.id)
                    .values(label=old_label, supported_uses=old_uses)
                )
                await session.commit()
        assert view.water_category is not None
        # FR-014, FR-024: the label is frozen at confirmation; the uses text is live.
        assert view.water_category.label == "Potable Water"
        assert view.water_category.supported_uses == "Updated uses text"

    run(scenario)


def test_the_staff_views_do_not_carry_the_customer_only_fields() -> None:
    from app.modules.orders.schemas import AdminOrderRead

    assert not {"delivery_window", "price", "water_category"} & set(AdminOrderRead.model_fields)
