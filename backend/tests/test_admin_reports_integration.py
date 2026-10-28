"""Admin dashboard, reports, live map and activity against a real database (#102, part 2).

docs/api/admin-operations.md: BR-09 (real records by default, simulated
ones only with ``simulated=only``, never mixed), Lagos days, orders "today
including open", on-time deliveries, cash collected and reconciled, the
``not_recorded`` and no-zone buckets, deliveries per driver, pickups per
source, the "now" values, the live map without customer data, and the
activity list without customer names.

The database may hold other rows, so each check compares the numbers
before and after this test adds its own. Runs only when TEST_DATABASE_URL
is set (``alembic upgrade head`` first); every row is deleted afterwards.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.modules.auth.models import User, UserRole
from app.modules.deliveries.models import ExceptionCategory, HoldKind, OrderException, PickupRecord
from app.modules.dispatch.models import (
    ApprovalStatus,
    Assignment,
    AssignmentStatus,
    DriverProfile,
)
from app.modules.dispatch.models import DeliveryType as PartnerType
from app.modules.orders.models import DeliveryType, Order, OrderEvent, OrderStatus
from app.modules.orders.service import REFERENCE_ALPHABET
from app.modules.payments.models import CashCollection, CashCollectionStatus, CashRemittance
from app.modules.reporting import service as reporting
from app.modules.sources.models import WaterSource
from app.shared.lagos_time import LAGOS_TZ, lagos_day_start_utc, lagos_today
from tests import test_admin_operations_integration as part1
from tests import test_dispatch_integration as dispatch_tests
from tests import test_partners_integration as partners_tests
from tests.test_admin_operations_integration import Created
from tests.test_deliveries_integration import Sessions
from tests.test_orders_integration import TEST_DATABASE_URL, run

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created = part1.created

NOW = datetime.now(UTC).replace(microsecond=0)
# The Lagos day NOW falls in. Rows the "today" report must count are dated
# within it, so the test passes at any time of day, including just after
# midnight in Lagos (it failed in CI at 00:20 Lagos time, #123).
TODAY_START = lagos_day_start_utc(NOW.astimezone(LAGOS_TZ).date())
# The waiting order is always from an earlier Lagos day, at least 90 minutes
# ago: the dashboard counts it as still open, the "today" report does not.
WAITING_AT = min(NOW - timedelta(minutes=90), TODAY_START - timedelta(minutes=1))
# Picked up shortly before delivery, but never before today began.
PICKUP_AT = max(NOW - timedelta(minutes=30), TODAY_START)


async def add_order(
    sessions: Sessions,
    customer: User,
    *,
    status: OrderStatus,
    simulated: bool = False,
    keke: bool = False,
    zone_id: uuid.UUID | None = None,
    source_id: uuid.UUID | None = None,
    created_at: datetime = NOW,
    window_end: datetime | None = None,
) -> Order:
    """Insert an order directly in ``status`` (the counts do not depend on how it got there)."""
    order = Order(
        reference="MO-" + "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(10)),
        customer_id=customer.id,
        idempotency_key=uuid.uuid4(),
        status=status,
        quantity_litres=1200,
        contact_name="Ngozi Adeyemi",
        contact_phone="+2348000000001",
        delivery_address="12 Sample Close, Independence Layout, Enugu",
        is_simulated=simulated,
        source_id=source_id,
        service_zone_id=zone_id,
        delivery_type=DeliveryType.KEKE if keke else None,
        keke_can_size_litres=25 if keke else None,
        keke_can_count=48 if keke else None,
        delivery_window_start_at=window_end - timedelta(hours=2) if window_end else None,
        delivery_window_end_at=window_end,
        created_at=created_at,
        updated_at=created_at,
    )
    async with sessions() as session:
        session.add(order)
        await session.commit()
    return order


async def deliver(
    sessions: Sessions,
    order: Order,
    driver: User,
    admin: User,
    *,
    cash: int | None = None,
    reconciled: bool = False,
    source_id: uuid.UUID | None = None,
) -> None:
    """Give a delivered order its ``delivered`` event, completed job, cash and pickup."""
    async with sessions() as session:
        assignment = Assignment(
            order_id=order.id,
            driver_user_id=driver.id,
            status=AssignmentStatus.COMPLETED,
            offered_by=admin.id,
            responded_at=NOW - timedelta(hours=1),
            ended_at=NOW,
        )
        session.add(assignment)
        await session.flush()
        session.add(
            OrderEvent(
                order_id=order.id,
                from_status=OrderStatus.UNLOADING,
                to_status=OrderStatus.DELIVERED,
                actor_id=driver.id,
                created_at=NOW,
                updated_at=NOW,
            )
        )
        if cash is not None:
            remittance = None
            if reconciled:
                # Reconciled cash was received in a remittance first (FR-041).
                remittance = CashRemittance(
                    driver_id=driver.id,
                    recorded_minor_units=cash,
                    counted_minor_units=cash,
                    difference_minor_units=0,
                    received_by=admin.id,
                    remitted_at=NOW,
                )
                session.add(remittance)
                await session.flush()
            session.add(
                CashCollection(
                    order_id=order.id,
                    driver_id=driver.id,
                    assignment_id=assignment.id,
                    amount_minor_units=cash,
                    status=(
                        CashCollectionStatus.RECONCILED
                        if reconciled
                        else CashCollectionStatus.COLLECTED
                    ),
                    collected_at=NOW,
                    remittance_due_at=NOW + timedelta(days=1),
                    remittance_id=remittance.id if remittance else None,
                    remitted_at=NOW if remittance else None,
                    received_by=admin.id if remittance else None,
                    reconciled_at=NOW if remittance else None,
                    reconciled_by=admin.id if remittance else None,
                )
            )
        if source_id is not None:
            session.add(
                PickupRecord(
                    assignment_id=assignment.id,
                    order_id=order.id,
                    source_id=source_id,
                    volume_collected_litres=1200,
                    picked_up_at=PICKUP_AT,
                    recorded_by=driver.id,
                )
            )
        await session.commit()


async def approved_keke_driver(sessions: Sessions, created: Created, plate: str) -> User:
    driver = await dispatch_tests.add_driver(sessions, created)  # type: ignore[arg-type]
    async with sessions() as session:
        await session.execute(
            update(DriverProfile)
            .where(DriverProfile.user_id == driver.id)
            .values(
                approval_status=ApprovalStatus.APPROVED,
                delivery_type=PartnerType.KEKE,
                plate=plate,
                is_available=True,
            )
        )
        await session.commit()
    return driver


def diff(after: dict[str, int], before: dict[str, int]) -> dict[str, int]:
    return {
        k: after.get(k, 0) - before.get(k, 0)
        for k in after | before
        if after.get(k, 0) != before.get(k, 0)
    }


def test_dashboard_and_report_count_real_or_simulated_never_both(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await part1.add_admin(sessions, created)
        customer = await dispatch_tests.add_user(sessions, created, UserRole.CUSTOMER)  # type: ignore[arg-type]
        zone = await partners_tests.add_zone(sessions, created)  # type: ignore[arg-type]

        async def snapshot() -> tuple[
            reporting.Dashboard, reporting.Dashboard, reporting.Report, reporting.Report
        ]:
            async with sessions() as session:
                return (
                    await reporting.dashboard(session, day=lagos_today(), simulated=False),
                    await reporting.dashboard(session, day=lagos_today(), simulated=True),
                    await reporting.report(session, range_name="today", simulated=False),
                    await reporting.report(session, range_name="today", simulated=True),
                )

        dash_real0, dash_sim0, report_real0, report_sim0 = await snapshot()
        source = WaterSource(name="Sample Borehole Report", approximate_location="Sample gate")
        async with sessions() as session:
            session.add(source)
            await session.commit()
        created.source_ids.append(source.id)
        driver = await approved_keke_driver(sessions, created, "ENU-123-KK")

        # Real: one on time (keke, zone, reconciled cash, pickup), one late
        # without type or zone, one waiting 90 minutes, one older still open.
        on_time = await add_order(
            sessions,
            customer,
            status=OrderStatus.DELIVERED,
            keke=True,
            zone_id=zone.id,
            window_end=NOW + timedelta(hours=1),
        )
        await deliver(
            sessions, on_time, driver, admin, cash=450_000, reconciled=True, source_id=source.id
        )
        late = await add_order(
            sessions, customer, status=OrderStatus.DELIVERED, window_end=NOW - timedelta(hours=2)
        )
        await deliver(sessions, late, driver, admin, cash=100_000)
        await add_order(
            sessions,
            customer,
            status=OrderStatus.CONFIRMED,
            zone_id=zone.id,
            created_at=WAITING_AT,
        )
        await add_order(
            sessions, customer, status=OrderStatus.EN_ROUTE, created_at=NOW - timedelta(days=3)
        )
        # Simulated: one delivered keke order with cash (BR-09).
        demo = await add_order(
            sessions,
            customer,
            status=OrderStatus.DELIVERED,
            simulated=True,
            keke=True,
            zone_id=zone.id,
            window_end=NOW + timedelta(hours=1),
        )
        await deliver(sessions, demo, driver, admin, cash=99_900, source_id=source.id)

        dash_real, dash_sim, report_real, report_sim = await snapshot()

        # Dashboard, real: today's three plus the open order from 3 days ago.
        assert (dash_real.is_simulated, dash_sim.is_simulated) == (False, True)
        assert dash_real.orders.total - dash_real0.orders.total == 4
        assert diff(dash_real.orders.by_status, dash_real0.orders.by_status) == {
            "delivered": 2,
            "confirmed": 1,
            "en_route": 1,
        }
        assert diff(dash_real.orders.by_delivery_type, dash_real0.orders.by_delivery_type) == {
            "keke": 1,
            "not_recorded": 3,
        }
        assert (
            dash_real.deliveries.delivered - dash_real0.deliveries.delivered,
            dash_real.deliveries.with_window - dash_real0.deliveries.with_window,
            dash_real.deliveries.on_time - dash_real0.deliveries.on_time,
        ) == (2, 2, 1)
        assert (
            dash_real.cash.collected_minor_units - dash_real0.cash.collected_minor_units,
            dash_real.cash.reconciled_minor_units - dash_real0.cash.reconciled_minor_units,
        ) == (550_000, 450_000)
        assert dash_real.oldest_waiting_minutes is not None
        assert dash_real.oldest_waiting_minutes >= 90

        # Dashboard, simulated: only the demo order.
        assert dash_sim.orders.total - dash_sim0.orders.total == 1
        assert diff(dash_sim.orders.by_status, dash_sim0.orders.by_status) == {"delivered": 1}
        assert dash_sim.cash.collected_minor_units - dash_sim0.cash.collected_minor_units == 99_900

        # "Now" values are the same for both.
        assert dash_real.drivers == dash_sim.drivers
        assert dash_real.drivers.keke - dash_real0.drivers.keke == 1
        assert dash_real.sources_not_usable - dash_real0.sources_not_usable == 1  # no activation

        # Report, today, real: the waiting order (an earlier day) and the open
        # order from 3 days ago are not in range; the two delivered ones are.
        assert report_real.orders.total - report_real0.orders.total == 2
        zones = {row.zone_id: (row.orders, row.delivered) for row in report_real.by_zone}
        zones0 = {row.zone_id: (row.orders, row.delivered) for row in report_real0.by_zone}
        assert zones[zone.id] == (1, 1)
        assert (
            zones[None][0] - zones0.get(None, (0, 0))[0],
            zones[None][1] - zones0.get(None, (0, 0))[1],
        ) == (1, 1)
        assert sum(row.delivered for row in report_real.by_zone) == report_real.deliveries.delivered
        drivers = {row.driver.id: (row.plate, row.delivered) for row in report_real.by_driver}
        assert drivers[driver.id] == ("ENU-123-KK", 2)
        assert {row.source_id: row.pickups for row in report_real.by_source}[source.id] == 1
        assert (report_real.from_day, report_real.to_day) == (lagos_today(), lagos_today())

        # Report, today, simulated.
        assert report_sim.orders.total - report_sim0.orders.total == 1
        assert {row.driver.id: row.delivered for row in report_sim.by_driver}[driver.id] == 1
        assert {row.source_id: row.pickups for row in report_sim.by_source}[source.id] == 1
        assert {row.zone_id: row.orders for row in report_sim.by_zone}[zone.id] == 1

    run(scenario)


def test_report_ranges_end_today_in_lagos(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await dispatch_tests.add_user(sessions, created, UserRole.CUSTOMER)  # type: ignore[arg-type]
        async with sessions() as session:
            before = await reporting.report(session, range_name="7d", simulated=False)
            before_today = await reporting.report(session, range_name="today", simulated=False)
        await add_order(
            sessions, customer, status=OrderStatus.CANCELLED, created_at=NOW - timedelta(days=3)
        )
        async with sessions() as session:
            week = await reporting.report(session, range_name="7d", simulated=False)
            today = await reporting.report(session, range_name="today", simulated=False)
        assert (week.from_day, week.to_day) == (lagos_today() - timedelta(days=6), lagos_today())
        assert week.orders.total - before.orders.total == 1
        assert today.orders.total == before_today.orders.total

    run(scenario)


def test_live_map_holds_and_activity(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await part1.add_admin(sessions, created)
        customer = await dispatch_tests.add_user(sessions, created, UserRole.CUSTOMER)  # type: ignore[arg-type]
        zone = await partners_tests.add_zone(sessions, created)  # type: ignore[arg-type]
        source = WaterSource(
            name="Sample Borehole Map", approximate_location="Off Ogui Road", is_simulated=True
        )
        async with sessions() as session:
            session.add(source)
            await session.commit()
        created.source_ids.append(source.id)
        driver = await approved_keke_driver(sessions, created, "ENU-777-KK")
        async with sessions() as session:
            holds_before = await reporting.dashboard(session, day=lagos_today(), simulated=False)

        order = await add_order(
            sessions,
            customer,
            status=OrderStatus.EN_ROUTE,
            simulated=True,
            keke=True,
            zone_id=zone.id,
            source_id=source.id,
        )
        async with sessions() as session:
            assignment = Assignment(
                order_id=order.id,
                driver_user_id=driver.id,
                status=AssignmentStatus.ACCEPTED,
                offered_by=admin.id,
                responded_at=NOW,
            )
            session.add(assignment)
            await session.flush()
            # Two open holds on one job count once; a resolved one not at all.
            for resolved in (None, None, NOW):
                session.add(
                    OrderException(
                        order_id=order.id,
                        assignment_id=assignment.id,
                        category=ExceptionCategory.UNSAFE_TRANSFER,
                        hold_kind=HoldKind.UNSAFE_STOP,
                        resolved_at=resolved,
                        reported_by=driver.id,
                    )
                )
            # A driver's change and a customer's change, newest last.
            for actor, seconds in ((driver, 1), (customer, 2)):
                at = NOW + timedelta(seconds=seconds)
                session.add(
                    OrderEvent(
                        order_id=order.id,
                        to_status=OrderStatus.EN_ROUTE,
                        actor_id=actor.id,
                        created_at=at,
                        updated_at=at,
                    )
                )
            await session.commit()

        async with sessions() as session:
            board = await reporting.dashboard(session, day=lagos_today(), simulated=False)
            data = await reporting.live_map(session)
            items = await reporting.activity(session, limit=2)
        assert board.holds_open - holds_before.holds_open == 1

        (mine,) = [d for d in data.deliveries if d.job.order.id == order.id]
        assert (mine.job.driver.id, mine.job.plate) == (driver.id, "ENU-777-KK")
        assert (mine.source_name, mine.zone_name) == ("Sample Borehole Map", zone.name)
        assert {s.id: usable for s, usable in data.sources}[source.id] is False

        # Newest first; the customer's change has no actor, the driver's has.
        assert [(i.kind, i.order_reference, i.is_simulated) for i in items] == [
            ("order_status", order.reference, True),
            ("order_status", order.reference, True),
        ]
        assert items[0].actor is None
        assert items[1].actor is not None and items[1].actor.id == driver.id

    run(scenario)
