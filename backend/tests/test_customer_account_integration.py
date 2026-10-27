"""Customer profile and saved addresses against a real, migrated database.

docs/api/customer-account.md, "Profile" and "Saved addresses": the default
rules, the 20-address limit, ownership (another customer's address is
``address_not_found``), zones, the partial unique index and the audit rows.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Accounts use random fictional numbers and zones random names; everything
created is deleted afterwards, children first.
"""

import secrets
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from http import HTTPStatus

import psycopg
import pytest
from geoalchemy2 import WKTElement
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserRole
from app.modules.customers import service
from app.modules.customers.models import CustomerAddress
from app.modules.pricing.models import ServiceZone
from tests.test_orders_integration import TEST_DATABASE_URL, run

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

Sessions = async_sessionmaker[AsyncSession]


@dataclass
class Created:
    user_ids: list[uuid.UUID] = field(default_factory=list)
    zone_ids: list[uuid.UUID] = field(default_factory=list)


@pytest.fixture
def created(monkeypatch: pytest.MonkeyPatch) -> Iterator[Created]:
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL or "")
    get_settings.cache_clear()
    record = Created()
    yield record
    url = get_settings().sync_database_url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        users = (record.user_ids,)
        connection.execute("DELETE FROM audit_logs WHERE actor_id = ANY(%s)", users)
        connection.execute("DELETE FROM customer_addresses WHERE customer_id = ANY(%s)", users)
        connection.execute("DELETE FROM users WHERE id = ANY(%s)", users)
        connection.execute("DELETE FROM service_zones WHERE id = ANY(%s)", (record.zone_ids,))
    get_settings.cache_clear()


def phone() -> str:
    return "+234809" + "".join(secrets.choice("0123456789") for _ in range(7))


async def add_customer(sessions: Sessions, created: Created) -> User:
    user = User(
        name="Sample Customer", phone=phone(), password_hash="unused", role=UserRole.CUSTOMER
    )
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


def data(
    zone: ServiceZone, *, label: str = "Home", make_default: bool = False
) -> service.AddressData:
    return service.AddressData(
        label=label,
        address="12 Sample Close, Enugu",
        landmark=None,
        zone_id=zone.id,
        make_default=make_default,
    )


async def add(
    sessions: Sessions, customer: User, zone: ServiceZone, **kwargs: object
) -> service.AddressView:
    async with sessions() as session:
        return await service.add_address(session, customer, data(zone, **kwargs))  # type: ignore[arg-type]


async def defaults(sessions: Sessions, customer: User) -> list[str]:
    async with sessions() as session:
        views, _ = await service.list_addresses(session, customer, limit=100, offset=0)
    return [view.address.label for view in views if view.address.is_default]


async def labels(sessions: Sessions, customer: User) -> list[str]:
    async with sessions() as session:
        views, _ = await service.list_addresses(session, customer, limit=100, offset=0)
    return [view.address.label for view in views]


async def expect_error(code: str, status: HTTPStatus, coroutine: object) -> None:
    with pytest.raises(APIError) as caught:
        await coroutine  # type: ignore[misc]
    assert (caught.value.code, caught.value.status_code) == (code, status)


def test_first_address_is_the_default_and_make_default_moves_it(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_customer(sessions, created)
        zone = await add_zone(sessions, created)

        first = await add(sessions, customer, zone, label="Home")
        assert first.address.is_default  # whatever make_default said
        await add(sessions, customer, zone, label="Office")
        assert await defaults(sessions, customer) == ["Home"]

        await add(sessions, customer, zone, label="Shop", make_default=True)
        assert await defaults(sessions, customer) == ["Shop"]
        # Default first, then newest.
        assert await labels(sessions, customer) == ["Shop", "Office", "Home"]

        async with sessions() as session:
            changed = await service.set_default_address(session, customer, first.address.id)
        assert changed.address.is_default
        assert await defaults(sessions, customer) == ["Home"]

    run(scenario)


def test_update_replaces_fields_and_false_never_clears_the_default(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_customer(sessions, created)
        zone = await add_zone(sessions, created)
        other_zone = await add_zone(sessions, created, active=False)
        home = await add(sessions, customer, zone, label="Home")

        async with sessions() as session:
            updated = await service.update_address(
                session,
                customer,
                home.address.id,
                service.AddressData(
                    label="Old home",
                    address="4 Sample Road, Enugu",
                    landmark="Blue gate",
                    zone_id=other_zone.id,
                    make_default=False,
                ),
            )
        assert (updated.address.label, updated.address.landmark) == ("Old home", "Blue gate")
        # An inactive zone is accepted; the quote refuses it later (FR-010).
        assert (updated.zone.id, updated.zone.is_active) == (other_zone.id, False)
        assert updated.address.is_default
        assert updated.address.updated_at >= home.address.updated_at

        async with sessions() as session:
            audit = await session.scalar(
                select(AuditLog).where(
                    AuditLog.target_id == home.address.id,
                    AuditLog.action == "customer_address_updated",
                )
            )
        assert audit is not None
        assert audit.details == {
            "customer_id": str(customer.id),
            "fields": ["label", "address", "landmark", "zone_id"],
        }

    run(scenario)


def test_default_cannot_be_removed_while_others_exist_but_the_last_can(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_customer(sessions, created)
        zone = await add_zone(sessions, created)
        home = await add(sessions, customer, zone, label="Home")
        office = await add(sessions, customer, zone, label="Office")

        async with sessions() as session:
            await expect_error(
                "default_address",
                HTTPStatus.CONFLICT,
                service.remove_address(session, customer, home.address.id),
            )
        async with sessions() as session:
            await service.remove_address(session, customer, office.address.id)
        async with sessions() as session:
            await service.remove_address(session, customer, home.address.id)
        assert await labels(sessions, customer) == []

        # The next address is the default again.
        again = await add(sessions, customer, zone, label="New")
        assert again.address.is_default

    run(scenario)


def test_twenty_addresses_at_most(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_customer(sessions, created)
        zone = await add_zone(sessions, created)
        for number in range(service.MAX_ADDRESSES_PER_CUSTOMER):
            await add(sessions, customer, zone, label=f"Place {number}")
        async with sessions() as session:
            await expect_error(
                "address_limit_reached",
                HTTPStatus.CONFLICT,
                service.add_address(session, customer, data(zone, label="One too many")),
            )
        async with sessions() as session:
            _, total = await service.list_addresses(session, customer, limit=1, offset=0)
        assert total == service.MAX_ADDRESSES_PER_CUSTOMER

    run(scenario)


def test_unknown_zone_and_other_customers_addresses_are_not_found(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        owner = await add_customer(sessions, created)
        stranger = await add_customer(sessions, created)
        zone = await add_zone(sessions, created)
        home = await add(sessions, owner, zone)
        missing_zone = ServiceZone(id=uuid.uuid4(), name="none", is_active=True)

        async with sessions() as session:
            await expect_error(
                "service_zone_not_found",
                HTTPStatus.NOT_FOUND,
                service.add_address(session, owner, data(missing_zone)),
            )
        address_id = home.address.id
        for attempt in (
            lambda s: service.update_address(s, stranger, address_id, data(zone)),
            lambda s: service.set_default_address(s, stranger, address_id),
            lambda s: service.remove_address(s, stranger, address_id),
            lambda s: service.remove_address(s, owner, uuid.uuid4()),
        ):
            async with sessions() as session:
                await expect_error("address_not_found", HTTPStatus.NOT_FOUND, attempt(session))
        assert await labels(sessions, owner) == ["Home"]

    run(scenario)


def test_the_database_refuses_a_second_default(created: Created) -> None:
    """The partial unique index is the last defence for "one default"."""

    async def scenario(sessions: Sessions) -> None:
        customer = await add_customer(sessions, created)
        zone = await add_zone(sessions, created)
        await add(sessions, customer, zone)
        with pytest.raises(IntegrityError):
            async with sessions() as session:
                session.add(
                    CustomerAddress(
                        customer_id=customer.id,
                        zone_id=zone.id,
                        label="Second default",
                        address="4 Sample Road, Enugu",
                        is_default=True,
                    )
                )
                await session.commit()

    run(scenario)


def test_profile_counts_orders_and_addresses_and_writes_are_audited(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_customer(sessions, created)
        zone = await add_zone(sessions, created)
        home = await add(sessions, customer, zone)
        await add(sessions, customer, zone, label="Office")

        async with sessions() as session:
            profile = await service.get_profile(session, customer)
        assert (profile.order_count, profile.address_count) == (0, 2)

        async with sessions() as session:
            await service.set_default_address(session, customer, home.address.id)  # no change
            actions = list(
                await session.scalars(
                    select(AuditLog.action)
                    .where(AuditLog.actor_id == customer.id)
                    .order_by(AuditLog.created_at)
                )
            )
        assert actions == ["customer_address_added", "customer_address_added"]

    run(scenario)
