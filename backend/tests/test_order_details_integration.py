"""Order details and the picked zone against a real database (#21).

Contract: docs/api/order-details-and-price.md (agreed 2026-10-26). Covers
storing Keke and Tanker details with the exact litres (FR-021), the database
CHECK that refuses a mismatch, the zone (unknown refused, inactive accepted
as a request for assistance, FR-010), idempotent retries comparing the new
fields (FR-026), and ``OrderRead`` showing the zone's current name.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
"""

import uuid
from collections.abc import Iterator
from dataclasses import replace

import psycopg
import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.modules.auth.models import UserRole
from app.modules.orders import service
from app.modules.orders.models import (
    DeliveryType,
    Order,
    OrderStatus,
    TankType,
    WaterSourcePreference,
)
from app.modules.orders.schemas import OrderRead
from app.modules.orders.service import NewOrder
from app.modules.pricing import service as pricing
from tests import test_deliveries_integration as part1
from tests import test_service_zones_integration as zones_part
from tests.test_deliveries_integration import (
    TEST_DATABASE_URL,
    Created,
    Sessions,
    add_user,
    expect_error,
    run,
)
from tests.test_service_zones_integration import new_zone

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created = part1.created
zone_ids = zones_part.zone_ids


@pytest.fixture
def orders_first(zone_ids: list[uuid.UUID], created: Created) -> Iterator[None]:
    """Delete this test's orders before the zones they point at (RESTRICT)."""
    yield
    url = get_settings().sync_database_url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        connection.execute(
            "DELETE FROM order_events WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            (created.user_ids,),
        )
        connection.execute("DELETE FROM orders WHERE customer_id = ANY(%s)", (created.user_ids,))


def tanker(zone_id: uuid.UUID | None = None, **changes: object) -> NewOrder:
    base = NewOrder(
        idempotency_key=uuid.uuid4(),
        quantity_litres=3000,
        contact_name="Sample Customer",
        contact_phone="+2348000000001",
        delivery_address="12 Sample Close, Enugu",
        delivery_type=DeliveryType.TANKER,
        tanker_tank_type=TankType.GROUND,
        tanker_quantity_local_gallons=750,
        water_source=WaterSourcePreference.BOREHOLE,
        service_zone_id=zone_id,
    )
    return replace(base, **changes)  # type: ignore[arg-type]


KEKE = NewOrder(
    idempotency_key=uuid.uuid4(),
    quantity_litres=600,
    contact_name="Sample Customer",
    contact_phone="+2348000000001",
    delivery_address="12 Sample Close, Enugu",
    delivery_type=DeliveryType.KEKE,
    keke_can_size_litres=25,
    keke_can_count=24,
)


def test_keke_and_tanker_details_are_stored_and_read_with_the_zone(
    created: Created, zone_ids: list[uuid.UUID], orders_first: None
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        zone = await new_zone(sessions, zone_ids, admin)

        async with sessions() as session:
            keke, made = await service.create_order(session, customer_id=customer.id, request=KEKE)
        assert made and keke.status == OrderStatus.QUOTE_REQUESTED
        assert (keke.quantity_litres, keke.keke_can_size_litres, keke.keke_can_count) == (
            600,
            25,
            24,
        )

        async with sessions() as session:
            order, _ = await service.create_order(
                session, customer_id=customer.id, request=tanker(zone.zone.id)
            )
            names = await pricing.zone_names(session, [order.service_zone_id])
        read = OrderRead.from_order(order, names)
        assert read.tanker is not None and read.tanker.quantity_local_gallons == 750
        assert read.water_source == WaterSourcePreference.BOREHOLE
        assert read.service_zone is not None and read.service_zone.name == zone.zone.name

    run(scenario)


def test_the_database_refuses_details_that_do_not_match_the_litres(
    created: Created, zone_ids: list[uuid.UUID], orders_first: None
) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        async with sessions() as session:
            session.add(
                Order(
                    reference="MO-CHECKTEST1",
                    customer_id=customer.id,
                    idempotency_key=uuid.uuid4(),
                    status=OrderStatus.QUOTE_REQUESTED,
                    quantity_litres=1000,  # 750 gallons would be 3,000 L
                    contact_name="Sample Customer",
                    contact_phone="+2348000000001",
                    delivery_address="12 Sample Close, Enugu",
                    delivery_type=DeliveryType.TANKER,
                    tanker_tank_type=TankType.GROUND,
                    tanker_quantity_local_gallons=750,
                    water_source=WaterSourcePreference.BOREHOLE,
                )
            )
            with pytest.raises(IntegrityError, match="ck_orders_delivery_details_shape"):
                await session.commit()

    run(scenario)


def test_zones_unknown_refused_inactive_accepted(
    created: Created, zone_ids: list[uuid.UUID], orders_first: None
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        async with sessions() as session:
            await expect_error(
                service.create_order(
                    session, customer_id=customer.id, request=tanker(uuid.uuid4())
                ),
                404,
                "service_zone_not_found",
            )
        # An inactive zone is accepted: a quote request is FR-010's
        # request-assistance path for an address outside the active zones.
        inactive = await new_zone(sessions, zone_ids, admin, is_active=False)
        async with sessions() as session:
            order, made = await service.create_order(
                session, customer_id=customer.id, request=tanker(inactive.zone.id)
            )
        assert made and order.service_zone_id == inactive.zone.id

    run(scenario)


def test_t06_retries_compare_the_details(
    created: Created, zone_ids: list[uuid.UUID], orders_first: None
) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        request = tanker()
        async with sessions() as session:
            first, _ = await service.create_order(session, customer_id=customer.id, request=request)
        async with sessions() as session:
            again, made = await service.create_order(
                session, customer_id=customer.id, request=request
            )
        assert (again.id, made) == (first.id, False)
        changed = replace(request, water_source=WaterSourcePreference.NINTH_MILE)
        async with sessions() as session:
            await expect_error(
                service.create_order(session, customer_id=customer.id, request=changed),
                409,
                "idempotency_key_reused",
            )

    run(scenario)
