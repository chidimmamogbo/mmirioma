"""The admin customer directory against a real, migrated database (#45).

docs/api/admin-directory.md, "Customers": the list (newest first, search by
name and by phone in E.164 or local form, the 7-day count that leaves out
simulated orders), the detail (order count, the paid total from price
snapshots, addresses default first, the five newest orders), "id is not a
customer" as 404, and the staff address write (first address is the default,
inactive zone allowed, audit row with ids only).

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Everything created is deleted afterwards, children first.
"""

import secrets
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from http import HTTPStatus

import psycopg
import pytest
from geoalchemy2 import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserRole
from app.modules.customers import directory
from app.modules.customers.models import CustomerAddress
from app.modules.orders.models import Order, OrderEvent, OrderStatus, PaymentStatus
from app.modules.orders.service import REFERENCE_ALPHABET
from app.modules.pricing.models import AgreementMethod, OrderPriceSnapshot, ServiceZone
from app.modules.sources.models import WaterCategory, WaterSource
from tests.test_orders_integration import TEST_DATABASE_URL, run

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

Sessions = async_sessionmaker[AsyncSession]

NOW = datetime.now(UTC).replace(microsecond=0)
PAID = 4_500_000  # ₦45,000.00
ALSO_PAID = 1_250_000
NOT_PAID = 9_900_000


@dataclass
class Created:
    user_ids: list[uuid.UUID] = field(default_factory=list)
    zone_ids: list[uuid.UUID] = field(default_factory=list)
    source_ids: list[uuid.UUID] = field(default_factory=list)


@pytest.fixture
def created(monkeypatch: pytest.MonkeyPatch) -> Iterator[Created]:
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL or "")
    get_settings.cache_clear()
    record = Created()
    yield record
    url = get_settings().sync_database_url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        users = (record.user_ids,)
        orders = "(SELECT id FROM orders WHERE customer_id = ANY(%s))"
        connection.execute(
            f"DELETE FROM order_price_snapshots WHERE order_id IN {orders}",  # noqa: S608
            users,
        )
        connection.execute(f"DELETE FROM order_events WHERE order_id IN {orders}", users)  # noqa: S608
        connection.execute("DELETE FROM orders WHERE customer_id = ANY(%s)", users)
        connection.execute("DELETE FROM audit_logs WHERE actor_id = ANY(%s)", users)
        connection.execute("DELETE FROM customer_addresses WHERE customer_id = ANY(%s)", users)
        connection.execute("DELETE FROM users WHERE id = ANY(%s)", users)
        connection.execute("DELETE FROM water_sources WHERE id = ANY(%s)", (record.source_ids,))
        connection.execute("DELETE FROM service_zones WHERE id = ANY(%s)", (record.zone_ids,))
    get_settings.cache_clear()


def random_phone() -> str:
    # A fictional 0809 number, as the other integration tests use.
    return "+234809" + "".join(secrets.choice("0123456789") for _ in range(7))


async def add_user(
    sessions: Sessions,
    created: Created,
    *,
    name: str,
    role: UserRole = UserRole.CUSTOMER,
    phone: str | None = None,
    created_at: datetime | None = None,
    verified: bool = False,
) -> User:
    user = User(
        name=name,
        phone=phone or random_phone(),
        password_hash="unused",
        role=role,
        phone_verified_at=NOW if verified else None,
    )
    if created_at is not None:
        user.created_at = created_at
    async with sessions() as session:
        session.add(user)
        await session.commit()
    created.user_ids.append(user.id)
    return user


async def add_zone(sessions: Sessions, created: Created, *, active: bool = True) -> ServiceZone:
    zone = ServiceZone(
        name=f"Sample zone {secrets.token_hex(4)}",
        is_active=active,
        centre=WKTElement("POINT(7.4951 6.4584)", srid=4326),
    )
    async with sessions() as session:
        session.add(zone)
        await session.commit()
    created.zone_ids.append(zone.id)
    return zone


async def add_order(
    sessions: Sessions,
    customer: User,
    *,
    status: OrderStatus = OrderStatus.QUOTE_REQUESTED,
    created_at: datetime = NOW,
    simulated: bool = False,
    litres: int = 1200,
) -> Order:
    order = Order(
        reference="MO-" + "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(10)),
        customer_id=customer.id,
        idempotency_key=uuid.uuid4(),
        status=status,
        quantity_litres=litres,
        contact_name="Sample Customer",
        contact_phone="+2348000000001",
        delivery_address="12 Sample Close, Independence Layout, Enugu",
        is_simulated=simulated,
    )
    order.created_at = created_at
    async with sessions() as session:
        session.add(order)
        await session.commit()
    return order


async def price(
    sessions: Sessions,
    created: Created,
    order: Order,
    admin: User,
    *,
    total: int,
    status: PaymentStatus,
) -> None:
    """Freeze a price on the order and set its payment status, as confirmation and cash do."""
    async with sessions() as session:
        category = await session.scalar(
            select(WaterCategory).where(WaterCategory.code == "potable")
        )
        assert category is not None
        source = WaterSource(name=f"Sample source {secrets.token_hex(3)}", approximate_location="x")
        session.add(source)
        event = OrderEvent(order_id=order.id, to_status=OrderStatus.CONFIRMED, actor_id=admin.id)
        session.add(event)
        await session.flush()
        created.source_ids.append(source.id)
        session.add(
            OrderPriceSnapshot(
                order_id=order.id,
                event_id=event.id,
                total_minor_units=total,
                currency="NGN",
                is_manual=True,
                water_category_id=category.id,
                water_category_label=category.label,
                source_id=source.id,
                delivery_window_start_at=NOW + timedelta(days=1),
                delivery_window_end_at=NOW + timedelta(days=1, hours=2),
                entered_by=admin.id,
                entered_at=NOW,
                customer_agreement_method=AgreementMethod.PHONE_CALL,
                customer_agreed_at=NOW,
            )
        )
        stored = await session.get(Order, order.id)
        assert stored is not None
        stored.payment_status = status
        await session.commit()


def tag() -> str:
    return secrets.token_hex(4)


def test_list_is_newest_first_and_counts_every_order_of_each_customer(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        marker = tag()
        old = await add_user(
            sessions, created, name=f"Old {marker}", created_at=NOW - timedelta(days=3)
        )
        new = await add_user(sessions, created, name=f"New {marker}", created_at=NOW)
        await add_order(sessions, old)
        await add_order(sessions, old, status=OrderStatus.DELIVERED, simulated=True)
        driver = await add_user(sessions, created, name=f"Driver {marker}", role=UserRole.DRIVER)

        async with sessions() as session:
            page = await directory.list_customers(session, q=marker, limit=50, offset=0)

        assert [row.user.id for row in page.rows] == [new.id, old.id]
        assert [row.orders_count for row in page.rows] == [0, 2]  # any status, simulated too
        assert page.total == 2
        assert driver.id not in [row.user.id for row in page.rows]  # only customers

    run(scenario)


def test_pagination_returns_the_total_of_all_matches(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        marker = tag()
        for index in range(3):
            await add_user(
                sessions,
                created,
                name=f"Page {marker} {index}",
                created_at=NOW - timedelta(minutes=index),
            )

        async with sessions() as session:
            first = await directory.list_customers(session, q=marker, limit=2, offset=0)
            second = await directory.list_customers(session, q=marker, limit=2, offset=2)

        assert (first.total, len(first.rows)) == (3, 2)
        assert (second.total, len(second.rows)) == (3, 1)

    run(scenario)


def test_search_matches_a_name_part_in_any_case_and_a_phone_in_both_forms(
    created: Created,
) -> None:
    async def scenario(sessions: Sessions) -> None:
        marker = tag()
        phone = random_phone()  # +234809xxxxxxx
        user = await add_user(sessions, created, name=f"Ada {marker} Obi", phone=phone)
        local = "0" + phone[4:]  # 0809xxxxxxx

        async def found(q: str) -> list[uuid.UUID]:
            async with sessions() as session:
                page = await directory.list_customers(session, q=q, limit=50, offset=0)
            return [row.user.id for row in page.rows]

        assert user.id in await found(marker.upper())  # case-insensitive
        assert user.id in await found(local)  # local 0... form
        assert user.id in await found(phone)  # E.164 form
        assert user.id in await found(phone[-7:])  # a part of the phone
        # Fewer than 4 digits never match a phone, only a name.
        assert user.id not in await found(phone[-3:])
        # LIKE wildcards in the text are literal, not "match everything".
        assert await found("%") == [] or user.id not in await found("%")

    run(scenario)


def test_ordered_last_7_days_counts_customers_with_a_real_recent_order_only(
    created: Created,
) -> None:
    async def scenario(sessions: Sessions) -> None:
        marker = tag()
        recent = await add_user(sessions, created, name=f"Recent {marker}")
        simulated = await add_user(sessions, created, name=f"Sim {marker}")
        old = await add_user(sessions, created, name=f"Stale {marker}")

        async def count() -> int:
            async with sessions() as session:
                page = await directory.list_customers(session, q=marker, limit=50, offset=0)
            return page.ordered_last_7_days

        before = await count()
        await add_order(sessions, recent, created_at=NOW - timedelta(days=6, hours=23))
        await add_order(sessions, simulated, simulated=True)
        await add_order(sessions, old, created_at=NOW - timedelta(days=7, hours=1))
        # Counted across every customer, not only the matches of the search.
        assert await count() == before + 1

    run(scenario)


def test_detail_has_the_paid_total_addresses_default_first_and_five_newest_orders(
    created: Created,
) -> None:
    async def scenario(sessions: Sessions) -> None:
        marker = tag()
        admin = await add_user(sessions, created, name=f"Admin {marker}", role=UserRole.ADMIN)
        customer = await add_user(
            sessions, created, name=f"Detail {marker}", verified=True, phone=random_phone()
        )
        zone = await add_zone(sessions, created)
        orders = [
            await add_order(sessions, customer, created_at=NOW - timedelta(hours=hours))
            for hours in range(6, 0, -1)
        ]  # six orders, the oldest first
        await price(sessions, created, orders[0], admin, total=PAID, status=PaymentStatus.PAID)
        await price(sessions, created, orders[1], admin, total=ALSO_PAID, status=PaymentStatus.PAID)
        await price(
            sessions,
            created,
            orders[2],
            admin,
            total=NOT_PAID,
            status=PaymentStatus.PENDING_COLLECTION,
        )
        async with sessions() as session:
            for index, default in enumerate([False, True, False]):
                session.add(
                    CustomerAddress(
                        customer_id=customer.id,
                        zone_id=zone.id,
                        label=f"Place {index}",
                        address="12 Sample Close, Enugu",
                        is_default=default,
                        created_at=NOW - timedelta(minutes=10 - index),
                    )
                )
            await session.commit()

        async with sessions() as session:
            detail = await directory.get_customer(session, customer.id)

        assert detail.row.orders_count == 6
        assert detail.paid_total_minor_units == PAID + ALSO_PAID  # paid only, from the snapshots
        assert [item.address.label for item in detail.addresses] == [
            "Place 1",  # the default first
            "Place 2",  # then newest first
            "Place 0",
        ]
        assert detail.addresses[0].zone.id == zone.id
        assert [order.reference for order in detail.recent_orders] == [
            order.reference for order in reversed(orders[1:])
        ]  # the five newest, newest first
        assert detail.row.user.phone_verified_at is not None

    run(scenario)


def test_an_id_that_is_not_a_customer_is_not_found(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        marker = tag()
        admin = await add_user(sessions, created, name=f"Admin {marker}", role=UserRole.ADMIN)
        driver = await add_user(sessions, created, name=f"Driver {marker}", role=UserRole.DRIVER)
        for account_id in (admin.id, driver.id, uuid.uuid4()):
            async with sessions() as session:
                with pytest.raises(APIError) as caught:
                    await directory.get_customer(session, account_id)
            assert (caught.value.status_code, caught.value.code) == (
                HTTPStatus.NOT_FOUND,
                "customer_not_found",
            )

    run(scenario)


def test_staff_address_write_makes_the_first_one_default_and_audits_ids_only(
    created: Created,
) -> None:
    async def scenario(sessions: Sessions) -> None:
        marker = tag()
        admin = await add_user(sessions, created, name=f"Admin {marker}", role=UserRole.ADMIN)
        customer = await add_user(sessions, created, name=f"Cust {marker}")
        inactive = await add_zone(sessions, created, active=False)
        active = await add_zone(sessions, created)

        async def add(zone: ServiceZone, label: str) -> directory.CustomerDetail:
            async with sessions() as session:
                return await directory.add_address(
                    session,
                    admin=admin,
                    customer_id=customer.id,
                    label=label,
                    address="12 Sample Close, Enugu",
                    landmark="Opposite the blue gate",
                    zone_id=zone.id,
                )

        first = await add(inactive, "Shop")  # an inactive zone is allowed
        second = await add(active, "Home")

        assert [(a.address.label, a.address.is_default) for a in first.addresses] == [
            ("Shop", True)
        ]
        assert first.addresses[0].zone.is_active is False
        assert [(a.address.label, a.address.is_default) for a in second.addresses] == [
            ("Shop", True),  # later ones never change the default
            ("Home", False),
        ]
        async with sessions() as session:
            rows = list(
                await session.scalars(
                    select(AuditLog).where(
                        AuditLog.actor_id == admin.id, AuditLog.action == "customer_address_added"
                    )
                )
            )
        assert len(rows) == 2
        for row in rows:
            assert row.target_type == "customer_address"
            assert row.details == {"customer_id": str(customer.id)}  # ids only, no address text

    run(scenario)


def test_staff_address_write_refuses_an_unknown_customer_or_zone_and_saves_nothing(
    created: Created,
) -> None:
    async def scenario(sessions: Sessions) -> None:
        marker = tag()
        admin = await add_user(sessions, created, name=f"Admin {marker}", role=UserRole.ADMIN)
        driver = await add_user(sessions, created, name=f"Driver {marker}", role=UserRole.DRIVER)
        customer = await add_user(sessions, created, name=f"Cust {marker}")
        zone = await add_zone(sessions, created)

        async def refused(customer_id: uuid.UUID, zone_id: uuid.UUID) -> tuple[int, str]:
            async with sessions() as session:
                with pytest.raises(APIError) as caught:
                    await directory.add_address(
                        session,
                        admin=admin,
                        customer_id=customer_id,
                        label="Home",
                        address="12 Sample Close, Enugu",
                        landmark=None,
                        zone_id=zone_id,
                    )
            return caught.value.status_code, caught.value.code

        assert await refused(uuid.uuid4(), zone.id) == (404, "customer_not_found")
        assert await refused(driver.id, zone.id) == (404, "customer_not_found")
        assert await refused(customer.id, uuid.uuid4()) == (404, "service_zone_not_found")
        async with sessions() as session:
            detail = await directory.get_customer(session, customer.id)
        assert detail.addresses == []

    run(scenario)
