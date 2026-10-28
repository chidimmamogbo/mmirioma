"""Server quotes, ordering with a quote and confirming it, against a real database (#21).

Contract: docs/api/order-details-and-price.md (agreed 2026-10-26), with
question 14's confirm extension in docs/api/deliveries.md. Covers a stored
quote and its FR-024 components (the highest cost per litre of the
preferred kind, decision 3; the zone fee as the delivery cost, decision B),
every manual-quote reason in the agreed order (decision F) with nothing
stored, an order placed with a quote (rows 1 and 3 in one transaction,
``OrderRead.quote``, idempotent replay after expiry, and each refusal),
confirming a quoted order (row 7 alone, the quote's total, ``is_manual``
false) and setting a source's kind.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Every row is created here and deleted afterwards. The price list is global,
so it is cleared before and after each test, as in
test_price_lists_integration.py.
"""

import secrets
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta

import psycopg
import pytest
from sqlalchemy import func, select, update

from app.core.config import get_settings
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserRole
from app.modules.confirmation import service as confirmation
from app.modules.dispatch.models import VehicleProfile
from app.modules.messaging.sms import MockSmsProvider
from app.modules.orders import service as orders
from app.modules.orders.models import (
    DeliveryType,
    Order,
    OrderEvent,
    OrderStatus,
    TankType,
    WaterSourcePreference,
)
from app.modules.orders.schemas import AdminOrderRead, OrderRead
from app.modules.orders.service import NewOrder
from app.modules.pricing import price_lists, quotes
from app.modules.pricing import service as zones
from app.modules.pricing.models import (
    AgreementMethod,
    MarginType,
    OrderPriceSnapshot,
    Quote,
)
from app.modules.pricing.quotes import Choice, ManualReason
from app.modules.pricing.service import Coordinates, FeeInput, ZoneData
from app.modules.sources import service as sources
from app.modules.sources.models import (
    ActivationStatus,
    WaterCategory,
    WaterSource,
    WaterSourceCategory,
    WaterSourceKind,
)
from tests import test_deliveries_integration as part1
from tests.test_deliveries_integration import (
    TEST_DATABASE_URL,
    Created,
    Sessions,
    add_user,
    expect_error,
    run,
)
from tests.test_price_lists_integration import rule

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

S = OrderStatus
created = part1.created
ADDRESS = "12 Sample Close, Independence Layout, Enugu"


@dataclass
class Rows:
    zone_ids: list[uuid.UUID] = field(default_factory=list)
    vehicle_ids: list[uuid.UUID] = field(default_factory=list)


def _connect() -> psycopg.Connection:
    url = get_settings().sync_database_url.set(drivername="postgresql")
    return psycopg.connect(url.render_as_string(hide_password=False))


def _clear_price_lists(connection: psycopg.Connection) -> None:
    connection.execute("DELETE FROM price_rules")
    connection.execute("DELETE FROM price_list_versions")


@pytest.fixture
def rows(created: Created) -> Iterator[Rows]:
    """Delete orders, quotes, price lists, zones and vehicles before part 1 deletes users.

    Orders reference quotes, and quotes reference users, zones, price rules
    and vehicles (all RESTRICT), so they go first.
    """
    with _connect() as connection:
        _clear_price_lists(connection)
    tracked = Rows()
    yield tracked
    users = (created.user_ids,)
    with _connect() as connection:
        for statement in (
            "DELETE FROM order_price_snapshots WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM order_events WHERE order_id IN "
            "(SELECT id FROM orders WHERE customer_id = ANY(%s))",
            "DELETE FROM orders WHERE customer_id = ANY(%s)",
            "DELETE FROM quotes WHERE customer_id = ANY(%s)",
            "DELETE FROM audit_logs WHERE actor_id = ANY(%s)",
        ):
            connection.execute(statement, users)
        _clear_price_lists(connection)
        zone_ids = (tracked.zone_ids,)
        connection.execute(
            "DELETE FROM service_zone_delivery_fees WHERE zone_id = ANY(%s)", zone_ids
        )
        connection.execute("DELETE FROM service_zones WHERE id = ANY(%s)", zone_ids)
        connection.execute(
            "DELETE FROM vehicle_profiles WHERE id = ANY(%s)", (tracked.vehicle_ids,)
        )


@dataclass
class World:
    admin: User
    customer: User
    utility: WaterCategory
    potable: WaterCategory
    zone_id: uuid.UUID
    borehole_id: uuid.UUID


async def category(sessions: Sessions, code: str) -> WaterCategory:
    async with sessions() as session:
        row = await session.scalar(select(WaterCategory).where(WaterCategory.code == code))
    assert row is not None, "migration 0011 seeds the categories"
    return row


async def add_source(
    sessions: Sessions,
    created: Created,
    kind: WaterSourceKind | None,
    *,
    utility: WaterCategory | None = None,
    cost: int = 150,
    status: ActivationStatus = ActivationStatus.ACTIVATED,
) -> uuid.UUID:
    """A source of ``kind``, activated for ``utility`` at ``cost`` kobo per litre when given."""
    source = WaterSource(
        name=f"Sample Source {secrets.token_hex(3)}",
        approximate_location="Near the market gate",
        kind=kind,
    )
    async with sessions() as session:
        session.add(source)
        await session.flush()
        if utility is not None:
            session.add(
                WaterSourceCategory(
                    source_id=source.id,
                    water_category_id=utility.id,
                    status=status,
                    approved_until=date.today() + timedelta(days=90),
                    report_reference="LR-0001",
                    cost_per_litre_minor_units=cost,
                    status_reason=None if status is ActivationStatus.ACTIVATED else "Sample",
                )
            )
        await session.commit()
    created.source_ids.append(source.id)
    return source.id


async def add_zone(
    sessions: Sessions, rows: Rows, admin: User, *, fees: list[FeeInput], is_active: bool = True
) -> uuid.UUID:
    data = ZoneData(
        name=f"Sample Zone {secrets.token_hex(4)}",
        is_active=is_active,
        centre=Coordinates(latitude=6.4447, longitude=7.5108),
        boundary=None,
        fees=fees,
    )
    async with sessions() as session:
        view = await zones.create_zone(session, actor=admin, data=data)
    rows.zone_ids.append(view.zone.id)
    return view.zone.id


async def add_vehicle(sessions: Sessions, rows: Rows, payload: int) -> uuid.UUID:
    vehicle = VehicleProfile(vehicle_type="Sample tanker", safe_payload_litres=payload)
    async with sessions() as session:
        session.add(vehicle)
        await session.commit()
    rows.vehicle_ids.append(vehicle.id)
    return vehicle.id


async def save_prices(sessions: Sessions, admin: User) -> None:
    """One rule for every zone and category: ₦500 handling, a 10% margin."""
    async with sessions() as session:
        await price_lists.save_price_list(
            session,
            actor=admin,
            base_version=None,
            reason=None,
            rules=[
                rule(
                    max_litres=None,
                    handling_minor_units=50_000,
                    margin_type=MarginType.PERCENTAGE,
                    margin_amount_minor_units=None,
                    margin_basis_points=1000,
                )
            ],
        )


async def world(sessions: Sessions, created: Created, rows: Rows) -> World:
    """Everything a Tanker borehole quote needs.

    A zone fee of ₦3,000, a borehole at ₦1.50 per litre, a 3,000 L vehicle
    and the price list from :func:`save_prices`.
    """
    admin = await add_user(sessions, created, UserRole.ADMIN)
    customer = await add_user(sessions, created, UserRole.CUSTOMER)
    utility = await category(sessions, "utility")
    zone_id = await add_zone(
        sessions,
        rows,
        admin,
        fees=[FeeInput(water_category_id=utility.id, fee_minor_units=300_000)],
    )
    borehole_id = await add_source(sessions, created, WaterSourceKind.BOREHOLE, utility=utility)
    await add_vehicle(sessions, rows, 3000)
    await save_prices(sessions, admin)
    return World(
        admin, customer, utility, await category(sessions, "potable"), zone_id, borehole_id
    )


def tanker(zone_id: uuid.UUID | None, **changes: object) -> Choice:
    base = Choice(
        delivery_type="tanker",
        keke_can_size_litres=None,
        keke_can_count=None,
        tanker_tank_type="ground",
        tanker_quantity_local_gallons=750,
        water_source="borehole",
        quantity_litres=3000,
        delivery_address=ADDRESS,
        service_zone_id=zone_id,
    )
    return replace(base, **changes)  # type: ignore[arg-type]


def order_for(choice: Choice, quote_id: uuid.UUID | None, **changes: object) -> NewOrder:
    base = NewOrder(
        idempotency_key=uuid.uuid4(),
        quantity_litres=choice.quantity_litres,
        contact_name="Sample Customer",
        contact_phone="+2348000000001",
        delivery_address=choice.delivery_address,
        delivery_type=DeliveryType(choice.delivery_type),
        tanker_tank_type=TankType(choice.tanker_tank_type) if choice.tanker_tank_type else None,
        tanker_quantity_local_gallons=choice.tanker_quantity_local_gallons,
        water_source=(WaterSourcePreference(choice.water_source) if choice.water_source else None),
        service_zone_id=choice.service_zone_id,
        quote_id=quote_id,
    )
    return replace(base, **changes)  # type: ignore[arg-type]


async def ask(sessions: Sessions, customer: User, choice: Choice) -> quotes.QuoteAnswer:
    async with sessions() as session:
        return await quotes.create_quote(session, customer_id=customer.id, choice=choice)


async def quote_count(sessions: Sessions, customer: User) -> int:
    async with sessions() as session:
        count = await session.scalar(
            select(func.count()).select_from(Quote).where(Quote.customer_id == customer.id)
        )
    return count or 0


# --- POST /quotes ---------------------------------------------------------------------


def test_a_quote_stores_every_component_and_answers_the_total(created: Created, rows: Rows) -> None:
    async def scenario(sessions: Sessions) -> None:
        w = await world(sessions, created, rows)
        # Decision 3: the highest eligible cost of the preferred kind prices
        # the water; a dearer source of another kind does not count.
        await add_source(sessions, created, WaterSourceKind.BOREHOLE, utility=w.utility, cost=120)
        await add_source(sessions, created, WaterSourceKind.NINTH_MILE, utility=w.utility, cost=900)
        before = datetime.now(UTC)
        answer = await ask(sessions, w.customer, tanker(w.zone_id))

        assert answer.reason is None and answer.quote is not None
        quote = answer.quote
        assert (quote.cost_per_litre_minor_units, quote.water_minor_units) == (150, 450_000)
        # The zone fee is the whole delivery cost (decision B).
        assert (quote.delivery_minor_units, quote.handling_minor_units) == (300_000, 50_000)
        # 10% of 800,000; already whole naira, so no rounding.
        assert (quote.margin_minor_units, quote.rounding_minor_units) == (80_000, 0)
        assert quote.total_minor_units == 880_000
        assert (quote.water_category_id, quote.water_category_label) == (
            w.utility.id,
            w.utility.label,
        )
        assert (quote.trips, quote.safe_payload_litres) == (1, 3000)
        assert quote.customer_id == w.customer.id
        validity = timedelta(minutes=get_settings().quote_validity_minutes)
        assert before + validity <= quote.price_valid_until <= datetime.now(UTC) + validity

        async with sessions() as session:
            stored = await session.get(Quote, quote.id)
        assert stored is not None and stored.total_minor_units == 880_000

    run(scenario)


def test_keke_takes_any_kind_and_the_smallest_vehicle_in_the_fewest_trips(
    created: Created, rows: Rows
) -> None:
    async def scenario(sessions: Sessions) -> None:
        w = await world(sessions, created, rows)
        small = await add_vehicle(sessions, rows, 700)
        await add_vehicle(sessions, rows, 400)  # needs 2 trips for 600 L: not the fewest
        keke = tanker(
            w.zone_id,
            delivery_type="keke",
            keke_can_size_litres=25,
            keke_can_count=24,
            tanker_tank_type=None,
            tanker_quantity_local_gallons=None,
            water_source=None,
            quantity_litres=600,
        )
        answer = await ask(sessions, w.customer, keke)
        assert answer.quote is not None
        assert (answer.quote.vehicle_profile_id, answer.quote.trips) == (small, 1)

    run(scenario)


def test_manual_reasons_in_the_agreed_order_and_nothing_stored(
    created: Created, rows: Rows
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        utility = await category(sessions, "utility")
        fee = [FeeInput(water_category_id=utility.id, fee_minor_units=300_000)]

        async def reason(choice: Choice) -> ManualReason | None:
            answer = await ask(sessions, customer, choice)
            assert answer.quote is None
            return answer.reason

        # Unknown zone: 404, not a manual quote.
        async with sessions() as session:
            await expect_error(
                quotes.create_quote(session, customer_id=customer.id, choice=tanker(uuid.uuid4())),
                404,
                "service_zone_not_found",
            )
        # T-02: no zone, or an inactive one.
        assert await reason(tanker(None)) is ManualReason.OUTSIDE_SERVICE_ZONE
        inactive = await add_zone(sessions, rows, admin, fees=fee, is_active=False)
        assert await reason(tanker(inactive)) is ManualReason.OUTSIDE_SERVICE_ZONE

        zone = await add_zone(sessions, rows, admin, fees=fee)
        # FR-014: no source activated for the pilot category.
        assert await reason(tanker(zone)) is ManualReason.CATEGORY_UNAVAILABLE

        # T-04 / FR-012: activated, but not of the preferred kind.
        await add_source(sessions, created, WaterSourceKind.NINTH_MILE, utility=utility)
        assert await reason(tanker(zone)) is ManualReason.NO_ELIGIBLE_SOURCE
        await add_source(sessions, created, WaterSourceKind.BOREHOLE, utility=utility)

        # T-03: no vehicle carries 100,000 L in two trips.
        await add_vehicle(sessions, rows, 3000)
        huge = tanker(zone, tanker_quantity_local_gallons=25_000, quantity_litres=100_000)
        assert await reason(huge) is ManualReason.NO_VEHICLE_PLAN

        # T-18: the zone has no fee for the category.
        no_fee = await add_zone(sessions, rows, admin, fees=[])
        assert await reason(tanker(no_fee)) is ManualReason.DELIVERY_COST_UNAVAILABLE

        # Decision A: no price rule (no price list saved yet).
        assert await reason(tanker(zone)) is ManualReason.NO_PRICE_RULE

        assert await quote_count(sessions, customer) == 0

    run(scenario)


def test_a_suspended_source_does_not_price(created: Created, rows: Rows) -> None:
    async def scenario(sessions: Sessions) -> None:
        w = await world(sessions, created, rows)
        async with sessions() as session:
            await session.execute(
                update(WaterSourceCategory)
                .where(WaterSourceCategory.source_id == w.borehole_id)
                .values(status=ActivationStatus.SUSPENDED, status_reason="Safety concern")
            )
            await session.commit()
        answer = await ask(sessions, w.customer, tanker(w.zone_id))
        # Still activated nowhere else: the category has no activation left.
        assert answer.reason is ManualReason.CATEGORY_UNAVAILABLE

    run(scenario)


# --- POST /orders with a quote ----------------------------------------------------------


def test_an_order_with_a_quote_awaits_confirmation_with_the_quote_frozen(
    created: Created, rows: Rows
) -> None:
    async def scenario(sessions: Sessions) -> None:
        w = await world(sessions, created, rows)
        choice = tanker(w.zone_id)
        answer = await ask(sessions, w.customer, choice)
        assert answer.quote is not None
        # The address may differ in case and spacing only.
        request = order_for(
            choice,
            answer.quote.id,
            delivery_address="  12 sample close,  Independence Layout, ENUGU",
        )

        async with sessions() as session:
            order, made = await orders.create_order(
                session, customer_id=w.customer.id, request=request
            )
        assert made and order.status is S.AWAITING_CONFIRMATION
        assert order.quote_id == answer.quote.id

        async with sessions() as session:
            events = list(
                await session.scalars(
                    select(OrderEvent)
                    .where(OrderEvent.order_id == order.id)
                    .order_by(OrderEvent.created_at, OrderEvent.id)
                )
            )
            lookups = await orders.read_lookups(session, [order])
        # Row 1 then row 3, both by the customer, in that order.
        assert [(e.from_status, e.to_status, e.actor_id) for e in events] == [
            (None, S.QUOTE_REQUESTED, w.customer.id),
            (S.QUOTE_REQUESTED, S.AWAITING_CONFIRMATION, w.customer.id),
        ]
        assert events[1].created_at > events[0].created_at

        read = OrderRead.from_order(order, lookups)
        assert read.quote is not None
        assert (read.quote.currency, read.quote.total_minor_units) == ("NGN", 880_000)
        assert read.quote.water_category.label == w.utility.label
        # Amendment #72: staff get the category id to confirm with; customers never do.
        assert "id" not in read.model_dump()["quote"]["water_category"]
        admin_read = AdminOrderRead.from_order(order, w.customer, lookups=lookups)
        assert admin_read.quote is not None
        assert admin_read.quote.water_category.id == w.utility.id
        assert admin_read.quote.total_minor_units == 880_000

        # T-06: a retry returns the original order, even once the quote expired.
        async with sessions() as session:
            await session.execute(
                update(Quote)
                .where(Quote.id == answer.quote.id)
                .values(price_valid_until=datetime.now(UTC) - timedelta(minutes=1))
            )
            await session.commit()
        async with sessions() as session:
            again, made_again = await orders.create_order(
                session, customer_id=w.customer.id, request=request
            )
        assert (again.id, made_again, again.status) == (order.id, False, S.AWAITING_CONFIRMATION)

    run(scenario)


def test_order_quote_refusals_write_nothing(created: Created, rows: Rows) -> None:
    async def scenario(sessions: Sessions) -> None:
        w = await world(sessions, created, rows)
        other = await add_user(sessions, created, UserRole.CUSTOMER)
        choice = tanker(w.zone_id)
        answer = await ask(sessions, w.customer, choice)
        others = await ask(sessions, other, choice)
        assert answer.quote is not None and others.quote is not None

        async def refused(request: NewOrder, status: int, code: str) -> object:
            async with sessions() as session:
                return await expect_error(
                    orders.create_order(session, customer_id=w.customer.id, request=request),
                    status,
                    code,
                )

        # Unknown, or another customer's: the same 404 (not probeable).
        await refused(order_for(choice, uuid.uuid4()), 404, "quote_not_found")
        await refused(order_for(choice, others.quote.id), 404, "quote_not_found")

        # A different address and zone: 422 naming both.
        new_zone = await add_zone(
            sessions,
            rows,
            w.admin,
            fees=[FeeInput(water_category_id=w.utility.id, fee_minor_units=300_000)],
        )
        mismatch = await refused(
            order_for(
                choice,
                answer.quote.id,
                delivery_address="14 Sample Close",
                service_zone_id=new_zone,
            ),
            422,
            "quote_mismatch",
        )
        assert [item["loc"] for item in mismatch.details] == [  # type: ignore[attr-defined]
            ["body", "service_zone_id"],
            ["body", "delivery_address"],
        ]
        await refused(
            order_for(choice, answer.quote.id, water_source=WaterSourcePreference.NINTH_MILE),
            422,
            "quote_mismatch",
        )

        # FR-012: no borehole is eligible any more.
        async with sessions() as session:
            await session.execute(
                update(WaterSourceCategory)
                .where(WaterSourceCategory.source_id == w.borehole_id)
                .values(status=ActivationStatus.SUSPENDED, status_reason="Safety concern")
            )
            await session.commit()
        await refused(order_for(choice, answer.quote.id), 409, "no_eligible_source")

        # SRS §8: an expired quote needs a new one.
        async with sessions() as session:
            await session.execute(
                update(Quote)
                .where(Quote.id == answer.quote.id)
                .values(price_valid_until=datetime.now(UTC) - timedelta(seconds=1))
            )
            await session.commit()
        await refused(order_for(choice, answer.quote.id), 409, "quote_expired")

        async with sessions() as session:
            placed = await session.scalar(
                select(func.count()).select_from(Order).where(Order.customer_id == w.customer.id)
            )
        assert placed == 0

    run(scenario)


# --- Confirming a quoted order (question 14) ---------------------------------------------


def test_a_quoted_order_is_confirmed_with_its_quote_total_by_row_7_alone(
    created: Created, rows: Rows
) -> None:
    async def scenario(sessions: Sessions) -> None:
        w = await world(sessions, created, rows)
        ninth_mile = await add_source(
            sessions, created, WaterSourceKind.NINTH_MILE, utility=w.utility
        )
        choice = tanker(w.zone_id)
        answer = await ask(sessions, w.customer, choice)
        assert answer.quote is not None
        async with sessions() as session:
            order, _ = await orders.create_order(
                session, customer_id=w.customer.id, request=order_for(choice, answer.quote.id)
            )
            await session.execute(
                update(User)
                .where(User.id == w.customer.id)
                .values(phone_verified_at=datetime.now(UTC) - timedelta(days=1))
            )
            await session.commit()

        # A little ahead, so the agreement is not before the order's database time.
        now = datetime.now(UTC) + timedelta(seconds=5)
        data = confirmation.ConfirmInput(
            expected_status=S.AWAITING_CONFIRMATION,
            water_category_id=w.utility.id,
            source_id=w.borehole_id,
            window_start_at=now + timedelta(days=1),
            window_end_at=now + timedelta(days=1, hours=2),
            total_minor_units=None,
            agreement_method=AgreementMethod.PHONE_CALL,
            agreed_at=now,
            note=None,
        )
        sms = MockSmsProvider()

        async def confirm(changes: dict[str, object]) -> None:
            async with sessions() as session:
                await confirmation.confirm_order(
                    session,
                    reference=order.reference,
                    admin=w.admin,
                    data=replace(data, **changes),  # type: ignore[arg-type]
                    sms=sms,
                    now=now,
                )

        # The category the customer accepted, and a source of their kind.
        wrong_category = await expect_error(
            confirm({"water_category_id": w.potable.id}), 422, "validation_error"
        )
        assert [d["loc"] for d in wrong_category.details] == [  # type: ignore[attr-defined]
            ["body", "water_category_id"]
        ]
        wrong_kind = await expect_error(confirm({"source_id": ninth_mile}), 422, "validation_error")
        assert [d["loc"] for d in wrong_kind.details] == [  # type: ignore[attr-defined]
            ["body", "source_id"]
        ]
        # The status the dispatcher saw must be the order's.
        await expect_error(
            confirm({"expected_status": S.QUOTE_REQUESTED, "total_minor_units": 900_000}),
            409,
            "invalid_order_transition",
        )

        await confirm({})
        async with sessions() as session:
            fresh = await session.get(Order, order.id)
            events = list(
                await session.scalars(
                    select(OrderEvent)
                    .where(OrderEvent.order_id == order.id)
                    .order_by(OrderEvent.created_at, OrderEvent.id)
                )
            )
            snapshot = await session.scalar(
                select(OrderPriceSnapshot).where(OrderPriceSnapshot.order_id == order.id)
            )
            audit = await session.scalar(
                select(AuditLog).where(
                    AuditLog.target_id == order.id, AuditLog.action == "order_confirmed"
                )
            )
        assert fresh is not None and fresh.status is S.CONFIRMED
        # No row 26: rows 1 and 3 from the customer, then row 7.
        assert [(e.from_status, e.to_status, e.reason_code) for e in events] == [
            (None, S.QUOTE_REQUESTED, None),
            (S.QUOTE_REQUESTED, S.AWAITING_CONFIRMATION, None),
            (S.AWAITING_CONFIRMATION, S.CONFIRMED, None),
        ]
        assert snapshot is not None
        assert (snapshot.total_minor_units, snapshot.is_manual, snapshot.event_id) == (
            880_000,
            False,
            events[2].id,
        )
        assert audit is not None and audit.details["manual_quote"] is False
        assert "Total N8,800.00" in sms.outbox[0].text

        # A repeat is refused, never a second snapshot or SMS.
        await expect_error(confirm({}), 409, "invalid_order_transition")
        assert len(sms.outbox) == 1

    run(scenario)


# --- Source kind (command line) ----------------------------------------------------------


def test_set_kind_is_audited_and_unknown_sources_are_refused(created: Created, rows: Rows) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        source_id = await add_source(sessions, created, None)
        async with sessions() as session:
            source = await sources.set_kind(
                session, actor=admin, source_id=source_id, kind=WaterSourceKind.NINTH_MILE
            )
        assert source.kind is WaterSourceKind.NINTH_MILE
        async with sessions() as session:
            audit = await session.scalar(
                select(AuditLog).where(
                    AuditLog.target_id == source_id, AuditLog.action == "water_source_kind_set"
                )
            )
            with pytest.raises(LookupError):
                await sources.set_kind(
                    session, actor=admin, source_id=uuid.uuid4(), kind=WaterSourceKind.BOREHOLE
                )
        assert audit is not None and audit.actor_id == admin.id

    run(scenario)
