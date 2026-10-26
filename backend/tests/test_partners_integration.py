"""Partner accounts against a real, migrated database (docs/api/partners.md).

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Accounts use random fictional numbers and zones random names; everything
created is deleted afterwards, children first.
"""

import secrets
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field

import psycopg
import pytest
from geoalchemy2 import WKTElement
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserRole
from app.modules.dispatch import service as dispatch_service
from app.modules.dispatch.models import (
    ApprovalStatus,
    AssignmentStatus,
    DeliveryType,
    DriverProfile,
    DriverServiceZone,
)
from app.modules.dispatch.service import Ineligibility
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import Notification
from app.modules.partners import service
from app.modules.pricing.models import ServiceZone
from tests.test_dispatch_integration import Created as DispatchCreated
from tests.test_dispatch_integration import add_driver, add_user, confirmed_order
from tests.test_orders_integration import TEST_DATABASE_URL, run

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]


@dataclass
class Created(DispatchCreated):
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
        connection.execute(
            "DELETE FROM order_events WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            users,
        )
        connection.execute("DELETE FROM assignments WHERE driver_user_id = ANY(%s)", users)
        # Notifications and driver_service_zones go with their orders,
        # users and profiles (ON DELETE CASCADE).
        connection.execute("DELETE FROM orders WHERE customer_id = ANY(%s)", users)
        connection.execute("DELETE FROM driver_profiles WHERE user_id = ANY(%s)", users)
        connection.execute("DELETE FROM vehicle_profiles WHERE id = ANY(%s)", (record.vehicle_ids,))
        connection.execute("DELETE FROM users WHERE id = ANY(%s)", users)
        connection.execute("DELETE FROM service_zones WHERE id = ANY(%s)", (record.zone_ids,))
    get_settings.cache_clear()


def phone() -> str:
    return "+234809" + "".join(secrets.choice("0123456789") for _ in range(7))


async def add_zone(
    sessions: async_sessionmaker[AsyncSession], created: Created, *, active: bool = True
) -> ServiceZone:
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


async def sign_up(
    sessions: async_sessionmaker[AsyncSession],
    created: Created,
    zone: ServiceZone,
    *,
    number: str | None = None,
) -> User:
    async with sessions() as session:
        user = await service.register_partner(
            session,
            name="Sample Driver",
            phone=number or phone(),
            password="sample-password",
            delivery_type=DeliveryType.TANKER,
            plate="ENU 456 CD",
            declared_capacity_gallons=4000,
            service_zone_id=zone.id,
        )
    created.user_ids.append(user.id)
    return user


async def set_approval(
    sessions: async_sessionmaker[AsyncSession], user: User, status: ApprovalStatus
) -> None:
    # The admin approval endpoint is #45; tests set the state directly.
    async with sessions() as session:
        await session.execute(
            update(DriverProfile)
            .where(DriverProfile.user_id == user.id)
            .values(approval_status=status)
        )
        await session.commit()


def test_sign_up_creates_a_pending_partner_with_the_declared_vehicle(created: Created) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        zone = await add_zone(sessions, created)
        user = await sign_up(sessions, created, zone)
        assert (user.role, user.is_active, user.phone_verified_at) == (
            UserRole.DRIVER,
            True,
            None,
        )
        async with sessions() as session:
            partner = await service.get_profile(session, user)
            audit = list(
                await session.scalars(select(AuditLog).where(AuditLog.actor_id == user.id))
            )
        profile = partner.profile
        assert (profile.approval_status, profile.is_available) == (ApprovalStatus.PENDING, False)
        assert (profile.delivery_type, profile.plate, profile.declared_capacity_gallons) == (
            DeliveryType.TANKER,
            "ENU 456 CD",
            4000,
        )
        # Nothing verified yet (partners.md, decision 8).
        assert (profile.vehicle_profile_id, partner.vehicle) == (None, None)
        assert profile.transfer_methods == []
        assert (profile.new_order_alerts, profile.sms_updates) == (True, True)
        assert [z.id for z in partner.zones] == [zone.id]
        assert [(a.action, a.target_id) for a in audit] == [("partner_registered", user.id)]

    run(scenario)


@pytest.mark.parametrize("active", [False, None], ids=["inactive zone", "unknown zone"])
def test_sign_up_needs_an_active_zone(created: Created, active: bool | None) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        zone_id = (await add_zone(sessions, created, active=False)).id if active is False else None
        number = phone()
        async with sessions() as session:
            with pytest.raises(APIError) as error:
                await service.register_partner(
                    session,
                    name="Sample Driver",
                    phone=number,
                    password="sample-password",
                    delivery_type=DeliveryType.KEKE,
                    plate="ENU-123-AB",
                    declared_capacity_gallons=None,
                    service_zone_id=zone_id or uuid.uuid4(),
                )
        assert (error.value.status_code, error.value.code) == (422, "validation_error")
        assert error.value.details[0]["loc"] == ["body", "service_zone_id"]
        async with sessions() as session:
            assert await session.scalar(select(User).where(User.phone == number)) is None

    run(scenario)


def test_sign_up_with_a_registered_phone_is_409_and_creates_nothing(created: Created) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        zone = await add_zone(sessions, created)
        first = await sign_up(sessions, created, zone)
        with pytest.raises(APIError) as error:
            await sign_up(sessions, created, zone, number=first.phone)
        assert (error.value.status_code, error.value.code) == (409, "phone_already_registered")
        async with sessions() as session:
            profiles = list(
                await session.scalars(
                    select(DriverProfile)
                    .join(User, User.id == DriverProfile.user_id)
                    .where(User.phone == first.phone)
                )
            )
        assert len(profiles) == 1

    run(scenario)


def test_going_online_needs_approval(created: Created) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        user = await sign_up(sessions, created, await add_zone(sessions, created))
        for status in (ApprovalStatus.PENDING, ApprovalStatus.SUSPENDED):
            await set_approval(sessions, user, status)
            async with sessions() as session:
                with pytest.raises(APIError) as error:
                    await service.set_availability(session, user, available=True)
            assert (error.value.status_code, error.value.code) == (403, "partner_not_approved")
            # Going offline is always allowed.
            async with sessions() as session:
                partner = await service.set_availability(session, user, available=False)
            assert partner.profile.is_available is False

        await set_approval(sessions, user, ApprovalStatus.APPROVED)
        async with sessions() as session:
            partner = await service.set_availability(session, user, available=True)
            # The same value again is no change and no audit row.
            await service.set_availability(session, user, available=True)
            actions = list(
                await session.scalars(
                    select(AuditLog.action)
                    .where(AuditLog.actor_id == user.id)
                    .order_by(AuditLog.created_at)
                )
            )
        assert partner.profile.is_available is True
        assert actions == ["partner_registered", "driver_went_online"]

    run(scenario)


def test_preferences_change_one_at_a_time(created: Created) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        user = await sign_up(sessions, created, await add_zone(sessions, created))
        async with sessions() as session:
            partner = await service.update_preferences(
                session, user, new_order_alerts=None, sms_updates=False
            )
        assert (partner.profile.new_order_alerts, partner.profile.sms_updates) == (True, False)

    run(scenario)


def test_a_driver_without_a_profile_gets_404(created: Created) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        driver = await add_user(sessions, created, UserRole.DRIVER)
        async with sessions() as session:
            with pytest.raises(APIError) as error:
                await service.get_profile(session, driver)
        assert (error.value.status_code, error.value.code) == (404, "no_driver_profile")

    run(scenario)


def test_a_pending_partner_is_never_offered_a_job(created: Created) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        partner = await sign_up(sessions, created, await add_zone(sessions, created))
        order = await confirmed_order(sessions, created)
        async with sessions() as session:
            with pytest.raises(APIError) as error:
                await dispatch_service.assign_driver(
                    session, order_id=order.id, driver_user_id=partner.id, admin=admin
                )
        assert error.value.code == "driver_not_eligible"
        assert error.value.details == {
            "reasons": [
                Ineligibility.NOT_APPROVED,
                Ineligibility.NO_DRIVER_PROFILE,
                Ineligibility.UNAVAILABLE,
            ]
        }

    run(scenario)


def test_offer_and_withdraw_leave_the_driver_notifications(created: Created) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        driver = await add_driver(sessions, created)
        order = await confirmed_order(sessions, created)
        async with sessions() as session:
            await dispatch_service.assign_driver(
                session, order_id=order.id, driver_user_id=driver.id, admin=admin
            )
        async with sessions() as session:
            await dispatch_service.withdraw_assignment(
                session, order_id=order.id, admin=admin, expected_status=AssignmentStatus.OFFERED
            )
        async with sessions() as session:
            page = await notifications_service.list_for_user(
                session, user_id=driver.id, limit=50, offset=0
            )
        assert [(v.notification.kind, v.order_reference) for v in page.items] == [
            ("reassigned", order.reference),
            ("assigned", order.reference),
        ]
        assert (page.total, page.unread_count) == (2, 2)
        # Never the delivery code or the customer's details.
        assert all(order.contact_phone not in v.notification.body for v in page.items)

    run(scenario)


def test_mark_read_ignores_other_peoples_ids(created: Created) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        mine = await add_user(sessions, created, UserRole.DRIVER)
        other = await add_user(sessions, created, UserRole.DRIVER)
        async with sessions() as session:
            first = notifications_service.add(
                session, user_id=mine.id, kind="account", title="One", body="First"
            )
            notifications_service.add(
                session, user_id=mine.id, kind="account", title="Two", body="Second"
            )
            theirs = notifications_service.add(
                session, user_id=other.id, kind="account", title="Theirs", body="Other"
            )
            await session.commit()

        async with sessions() as session:
            await notifications_service.mark_read(
                session, user_id=mine.id, ids=[first.id, theirs.id, uuid.uuid4()]
            )
        async with sessions() as session:
            assert (
                await notifications_service.list_for_user(
                    session, user_id=mine.id, limit=50, offset=0
                )
            ).unread_count == 1
            assert (await session.get(Notification, theirs.id)).read_at is None  # type: ignore[union-attr]

        async with sessions() as session:
            await notifications_service.mark_read(session, user_id=mine.id, ids=None)
        async with sessions() as session:
            page = await notifications_service.list_for_user(
                session, user_id=mine.id, limit=1, offset=0
            )
        assert (len(page.items), page.total, page.unread_count) == (1, 2, 0)

    run(scenario)


def test_a_profile_lists_its_zones_sign_up_zone_first(created: Created) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        first = await add_zone(sessions, created)
        second = await add_zone(sessions, created)
        user = await sign_up(sessions, created, first)
        async with sessions() as session:
            profile = await session.scalar(
                select(DriverProfile).where(DriverProfile.user_id == user.id)
            )
            assert profile is not None
            session.add(DriverServiceZone(driver_profile_id=profile.id, zone_id=second.id))
            await session.commit()
        async with sessions() as session:
            partner = await service.get_profile(session, user)
        assert [z.id for z in partner.zones] == [first.id, second.id]

    run(scenario)
