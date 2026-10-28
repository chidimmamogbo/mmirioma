"""Service zones and the zone delivery cost against a real database (#30).

Contract: docs/api/admin-directory.md, "Service zones" (agreed 2026-10-26).
Covers storing and reading zones (PostGIS point and polygon round trip),
fees per category, case-insensitive names (also under concurrent creates),
partial updates, the audit rows (NFR-004), the active list customers and
partners pick from (FR-020), and the FR-022 fallback delivery cost with its
manual-quote reasons (FR-010, T-02, T-18).

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Every row is created here and deleted afterwards.
"""

import asyncio
import secrets
import uuid
from collections.abc import Iterator

import psycopg
import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserRole
from app.modules.pricing import quotes
from app.modules.pricing import service as zones
from app.modules.pricing.models import ServiceZone
from app.modules.pricing.service import (
    Coordinates,
    FeeInput,
    ZoneCostUnavailable,
    ZoneData,
    ZoneUpdate,
)
from app.modules.sources.models import WaterCategory
from tests import test_deliveries_integration as part1
from tests.test_deliveries_integration import (
    TEST_DATABASE_URL,
    Created,
    Sessions,
    add_user,
    expect_error,
    run,
)

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created = part1.created

CENTRE = Coordinates(latitude=6.4447, longitude=7.5108)
SQUARE = [(7.5, 6.45), (7.51, 6.45), (7.51, 6.46), (7.5, 6.46), (7.5, 6.45)]
# A "bow tie": closed and long enough, but its edges cross.
BOW_TIE = [(7.5, 6.45), (7.51, 6.46), (7.51, 6.45), (7.5, 6.46), (7.5, 6.45)]


@pytest.fixture
def zone_ids(created: Created) -> Iterator[list[uuid.UUID]]:
    """Track zones; delete them, their fees and audit rows before the users."""
    ids: list[uuid.UUID] = []
    yield ids
    url = get_settings().sync_database_url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        connection.execute("DELETE FROM service_zone_delivery_fees WHERE zone_id = ANY(%s)", (ids,))
        connection.execute("DELETE FROM service_zones WHERE id = ANY(%s)", (ids,))
        connection.execute("DELETE FROM audit_logs WHERE actor_id = ANY(%s)", (created.user_ids,))


def unique_name(prefix: str = "Sample Zone") -> str:
    """Zone names are unique; tests may share a database with demo data."""
    return f"{prefix} {secrets.token_hex(4)}"


async def categories(sessions: Sessions) -> tuple[WaterCategory, WaterCategory]:
    async with sessions() as session:
        rows = {row.code: row for row in await session.scalars(select(WaterCategory))}
    assert {"potable", "utility"} <= rows.keys(), "migration 0011 seeds the categories"
    return rows["potable"], rows["utility"]


async def new_zone(
    sessions: Sessions,
    zone_ids: list[uuid.UUID],
    admin: User,
    *,
    name: str | None = None,
    is_active: bool = True,
    boundary: list[tuple[float, float]] | None = None,
    fees: list[FeeInput] | None = None,
) -> zones.ZoneView:
    data = ZoneData(
        name=name or unique_name(),
        is_active=is_active,
        centre=CENTRE,
        boundary=boundary,
        fees=fees or [],
    )
    async with sessions() as session:
        view = await zones.create_zone(session, actor=admin, data=data)
    zone_ids.append(view.zone.id)
    return view


async def audit_rows(sessions: Sessions, zone_id: uuid.UUID) -> list[tuple[str, dict]]:
    async with sessions() as session:
        rows = await session.scalars(
            select(AuditLog)
            .where(AuditLog.target_type == "service_zone", AuditLog.target_id == zone_id)
            .order_by(AuditLog.created_at, AuditLog.id)
        )
        return [(row.action, row.details) for row in rows]


# --- Create and read ------------------------------------------------------------------


def test_create_stores_the_point_polygon_and_fees_and_is_audited(
    created: Created, zone_ids: list[uuid.UUID]
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        potable, utility = await categories(sessions)
        view = await new_zone(
            sessions,
            zone_ids,
            admin,
            boundary=SQUARE,
            fees=[FeeInput(utility.id, 250_000), FeeInput(potable.id, 300_000)],
        )

        assert view.centre == CENTRE
        assert view.boundary == SQUARE
        # Fees come back with the category's label, by label.
        assert [(fee.water_category_label, fee.fee_minor_units) for fee in view.fees] == [
            (potable.label, 300_000),
            (utility.label, 250_000),
        ]
        async with sessions() as session:
            listed = [v for v in await zones.list_zones(session) if v.zone.id == view.zone.id]
        assert [(v.centre, v.boundary, v.fees) for v in listed] == [
            (view.centre, view.boundary, view.fees)
        ]
        assert await audit_rows(sessions, view.zone.id) == [
            (
                "service_zone_created",
                {"water_category_ids": [str(utility.id), str(potable.id)]},
            )
        ]

    run(scenario)


def test_names_are_unique_ignoring_case(created: Created, zone_ids: list[uuid.UUID]) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        name = unique_name("Independence Layout")
        first = await new_zone(sessions, zone_ids, admin, name=name)
        other = await new_zone(sessions, zone_ids, admin)

        async with sessions() as session:
            await expect_error(
                zones.create_zone(
                    session,
                    actor=admin,
                    data=ZoneData(name.upper(), True, CENTRE, None, []),
                ),
                409,
                "service_zone_name_taken",
            )
        async with sessions() as session:
            await expect_error(
                zones.update_zone(
                    session,
                    actor=admin,
                    zone_id=other.zone.id,
                    update=ZoneUpdate(sent=frozenset({"name"}), name=name.lower()),
                ),
                409,
                "service_zone_name_taken",
            )
        # Renaming a zone to its own name in another case is allowed.
        async with sessions() as session:
            renamed = await zones.update_zone(
                session,
                actor=admin,
                zone_id=first.zone.id,
                update=ZoneUpdate(sent=frozenset({"name"}), name=name.upper()),
            )
        assert renamed.zone.name == name.upper()

    run(scenario)


def test_concurrent_creates_with_one_name_give_one_zone(
    created: Created, zone_ids: list[uuid.UUID]
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        name = unique_name()

        async def attempt() -> zones.ZoneView | APIError:
            async with sessions() as session:
                try:
                    return await zones.create_zone(
                        session, actor=admin, data=ZoneData(name, True, CENTRE, None, [])
                    )
                except APIError as error:
                    return error

        results = await asyncio.gather(*(attempt() for _ in range(4)))
        stored = [result for result in results if isinstance(result, zones.ZoneView)]
        zone_ids.extend(view.zone.id for view in stored)
        refused = [result for result in results if isinstance(result, APIError)]
        assert len(stored) == 1
        assert {(error.status_code, error.code) for error in refused} == {
            (409, "service_zone_name_taken")
        }

    run(scenario)


def test_unknown_category_and_crossing_boundary_are_refused(
    created: Created, zone_ids: list[uuid.UUID]
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        name = unique_name()
        async with sessions() as session:
            await expect_error(
                zones.create_zone(
                    session,
                    actor=admin,
                    data=ZoneData(name, True, CENTRE, None, [FeeInput(uuid.uuid4(), 100)]),
                ),
                404,
                "water_category_not_found",
            )
        async with sessions() as session:
            error = await expect_error(
                zones.create_zone(
                    session, actor=admin, data=ZoneData(name, True, CENTRE, BOW_TIE, [])
                ),
                422,
                "validation_error",
            )
        assert error.details[0]["loc"] == ["body", "boundary"]
        async with sessions() as session:
            assert await session.scalar(select(ServiceZone).where(ServiceZone.name == name)) is None

    run(scenario)


# --- Update ---------------------------------------------------------------------------


def test_update_applies_only_sent_fields_and_is_audited(
    created: Created, zone_ids: list[uuid.UUID]
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        potable, utility = await categories(sessions)
        view = await new_zone(
            sessions, zone_ids, admin, boundary=SQUARE, fees=[FeeInput(potable.id, 300_000)]
        )

        # A fee-only change replaces the list and still moves updated_at.
        async with sessions() as session:
            fees_changed = await zones.update_zone(
                session,
                actor=admin,
                zone_id=view.zone.id,
                update=ZoneUpdate(sent=frozenset({"fees"}), fees=[FeeInput(utility.id, 0)]),
            )
        assert [(fee.water_category_id, fee.fee_minor_units) for fee in fees_changed.fees] == [
            (utility.id, 0)
        ]
        assert fees_changed.zone.name == view.zone.name
        assert fees_changed.boundary == SQUARE
        assert fees_changed.zone.updated_at > view.zone.updated_at

        # null clears the boundary; is_active and centre change; [] removes fees.
        async with sessions() as session:
            changed = await zones.update_zone(
                session,
                actor=admin,
                zone_id=view.zone.id,
                update=ZoneUpdate(
                    sent=frozenset({"boundary", "is_active", "centre", "fees"}),
                    boundary=None,
                    is_active=False,
                    centre=Coordinates(latitude=-1.5, longitude=179.25),
                    fees=[],
                ),
            )
        assert (changed.boundary, changed.zone.is_active, changed.fees) == (None, False, [])
        assert changed.centre == Coordinates(latitude=-1.5, longitude=179.25)

        # Nothing sent: unchanged and not audited.
        async with sessions() as session:
            same = await zones.update_zone(
                session, actor=admin, zone_id=view.zone.id, update=ZoneUpdate(sent=frozenset())
            )
        assert same.zone.updated_at == changed.zone.updated_at

        assert [action for action, _ in await audit_rows(sessions, view.zone.id)] == [
            "service_zone_created",
            "service_zone_updated",
            "service_zone_updated",
        ]
        assert (await audit_rows(sessions, view.zone.id))[2][1] == {
            "fields": ["boundary", "centre", "fees", "is_active"]
        }

    run(scenario)


def test_update_of_an_unknown_zone_is_not_found(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        async with sessions() as session:
            await expect_error(
                zones.update_zone(
                    session,
                    actor=admin,
                    zone_id=uuid.uuid4(),
                    update=ZoneUpdate(sent=frozenset({"is_active"}), is_active=False),
                ),
                404,
                "service_zone_not_found",
            )

    run(scenario)


# --- What customers and partners pick (FR-020) -----------------------------------------


def test_only_active_zones_are_offered(created: Created, zone_ids: list[uuid.UUID]) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        active = await new_zone(sessions, zone_ids, admin)
        inactive = await new_zone(sessions, zone_ids, admin, is_active=False)
        async with sessions() as session:
            offered = {zone.id for zone in await zones.list_active_zones(session)}
        assert active.zone.id in offered
        assert inactive.zone.id not in offered

    run(scenario)


# --- The pilot category in the admin list (amendment #74, #109) -------------------------


def test_pilot_category_is_the_configured_code(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        potable, utility = await categories(sessions)
        expected = {"potable": potable, "utility": utility}[get_settings().pilot_water_category]
        async with sessions() as session:
            category = await quotes.pilot_category(session)
        assert category is not None
        assert (category.id, category.label) == (expected.id, expected.label)

    run(scenario)


# --- Delivery cost from the zone (FR-022 fallback) -------------------------------------


def test_delivery_cost_is_the_zones_fee_for_the_category(
    created: Created, zone_ids: list[uuid.UUID]
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        potable, utility = await categories(sessions)
        zone = await new_zone(sessions, zone_ids, admin, fees=[FeeInput(potable.id, 300_000)])
        async with sessions() as session:
            cost = await zones.delivery_cost_from_zone(
                session, zone_id=zone.zone.id, water_category_id=potable.id
            )
        assert cost == zones.ZoneDeliveryCost(300_000, None)

    run(scenario)


def test_t18_no_fee_for_the_category_is_delivery_cost_unavailable(
    created: Created, zone_ids: list[uuid.UUID]
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        potable, utility = await categories(sessions)
        zone = await new_zone(sessions, zone_ids, admin, fees=[FeeInput(potable.id, 300_000)])
        async with sessions() as session:
            cost = await zones.delivery_cost_from_zone(
                session, zone_id=zone.zone.id, water_category_id=utility.id
            )
        # Never another category's fee or an estimate.
        assert cost == zones.ZoneDeliveryCost(None, ZoneCostUnavailable.DELIVERY_COST_UNAVAILABLE)

    run(scenario)


def test_t02_no_zone_or_an_inactive_zone_is_outside_the_service_zone(
    created: Created, zone_ids: list[uuid.UUID]
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        potable, _ = await categories(sessions)
        inactive = await new_zone(
            sessions, zone_ids, admin, is_active=False, fees=[FeeInput(potable.id, 300_000)]
        )
        outside = zones.ZoneDeliveryCost(None, ZoneCostUnavailable.OUTSIDE_SERVICE_ZONE)
        async with sessions() as session:
            assert (
                await zones.delivery_cost_from_zone(
                    session, zone_id=None, water_category_id=potable.id
                )
                == outside
            )
            # The inactive zone's fee is not used.
            assert (
                await zones.delivery_cost_from_zone(
                    session, zone_id=inactive.zone.id, water_category_id=potable.id
                )
                == outside
            )
            await expect_error(
                zones.delivery_cost_from_zone(
                    session, zone_id=uuid.uuid4(), water_category_id=potable.id
                ),
                404,
                "service_zone_not_found",
            )

    run(scenario)
