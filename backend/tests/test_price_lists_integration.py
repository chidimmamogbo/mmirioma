"""Price lists and rule matching against a real database (#37).

Contract: docs/api/admin-directory.md, "Price lists" (agreed 2026-10-26).
Covers saving versions (first list, changes from the previous version, the
audit row), every refusal (stale base version, unchanged rules, overlapping
bands, unknown zone or category), two concurrent saves, the page and current
reads, and :func:`match_price_rule` (zone and category specificity, bands,
no match).

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Price lists are global, so each test starts and ends with no saved version;
the zones, users and audit rows it creates are deleted afterwards.
"""

import asyncio
import uuid
from collections.abc import Iterator
from dataclasses import replace

import psycopg
import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.audit.models import AuditLog
from app.modules.auth.models import UserRole
from app.modules.pricing import price_lists
from app.modules.pricing.models import MarginType
from app.modules.pricing.price_lists import RuleInput
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
from tests.test_service_zones_integration import new_zone

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created = part1.created


def _clear_price_lists() -> None:
    url = get_settings().sync_database_url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        connection.execute("DELETE FROM price_rules")
        connection.execute("DELETE FROM price_list_versions")


@pytest.fixture
def zone_ids(created: Created) -> Iterator[list[uuid.UUID]]:
    """Start with no price list; afterwards delete it, the zones and the audit rows."""
    _clear_price_lists()
    ids: list[uuid.UUID] = []
    yield ids
    _clear_price_lists()
    url = get_settings().sync_database_url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        connection.execute("DELETE FROM service_zone_delivery_fees WHERE zone_id = ANY(%s)", (ids,))
        connection.execute("DELETE FROM service_zones WHERE id = ANY(%s)", (ids,))
        connection.execute("DELETE FROM audit_logs WHERE actor_id = ANY(%s)", (created.user_ids,))


def rule(**changes: object) -> RuleInput:
    base = RuleInput(
        zone_id=None,
        water_category_id=None,
        min_litres=600,
        max_litres=1999,
        base_delivery_fee_minor_units=100_000,
        distance_rate_minor_units_per_km=10_000,
        additional_trip_minor_units=80_000,
        handling_minor_units=20_000,
        margin_type=MarginType.FIXED,
        margin_amount_minor_units=50_000,
        margin_basis_points=None,
    )
    return replace(base, **changes)  # type: ignore[arg-type]


LARGE = rule(
    min_litres=2000,
    max_litres=None,
    base_delivery_fee_minor_units=200_000,
    margin_type=MarginType.PERCENTAGE,
    margin_amount_minor_units=None,
    margin_basis_points=1000,
)


async def utility(sessions: Sessions) -> WaterCategory:
    async with sessions() as session:
        row = await session.scalar(select(WaterCategory).where(WaterCategory.code == "utility"))
    assert row is not None, "migration 0011 seeds the categories"
    return row


def test_first_list_then_a_new_version_with_its_changes(
    created: Created, zone_ids: list[uuid.UUID]
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        async with sessions() as session:
            await expect_error(price_lists.current_price_list(session), 404, "price_list_not_found")

        async with sessions() as session:
            first = await price_lists.save_price_list(
                session, actor=admin, base_version=None, reason=None, rules=[rule(), LARGE]
            )
        assert (first.version.version, first.version.changes) == (1, [])
        assert first.created_by.name == admin.name
        assert [r.position for r in first.rules] == [0, 1]

        changed = replace(LARGE, distance_rate_minor_units_per_km=15_000)
        async with sessions() as session:
            second = await price_lists.save_price_list(
                session,
                actor=admin,
                base_version=1,
                reason="Diesel price rise",
                rules=[
                    rule(),
                    changed,
                    rule(
                        min_litres=600,
                        max_litres=None,
                        zone_id=None,
                        water_category_id=(await utility(sessions)).id,
                    ),
                ],
            )
        assert second.version.version == 2
        assert second.version.reason == "Diesel price rise"
        assert second.version.changes[0] == {
            "path": "rules[1].distance_rate_minor_units_per_km",
            "from": 10_000,
            "to": 15_000,
        }
        added = second.version.changes[1]
        assert (added["path"], added["from"]) == ("rules[2]", None)

        async with sessions() as session:
            current = await price_lists.current_price_list(session)
            page, total = await price_lists.list_price_lists(session, limit=1, offset=0)
        assert current.version.version == 2
        assert (total, [v.version.version for v in page]) == (2, [2])

        async with sessions() as session:
            audits = list(
                await session.scalars(
                    select(AuditLog)
                    .where(AuditLog.action == "price_list_saved", AuditLog.actor_id == admin.id)
                    .order_by(AuditLog.created_at)
                )
            )
        assert [a.details for a in audits] == [
            {"version": 1, "rules": 2},
            {"version": 2, "rules": 3},
        ]

    run(scenario)


def test_refusals(created: Created, zone_ids: list[uuid.UUID]) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        async with sessions() as session:
            await price_lists.save_price_list(
                session, actor=admin, base_version=None, reason=None, rules=[rule(), LARGE]
            )

        async def save(base: int | None, rules: list[RuleInput]) -> object:
            async with sessions() as session:
                return await price_lists.save_price_list(
                    session, actor=admin, base_version=base, reason=None, rules=rules
                )

        stale = await expect_error(save(None, [rule()]), 409, "price_list_changed")
        assert stale.details == {"current_version": 1}
        await expect_error(save(1, [rule(), LARGE]), 409, "price_list_unchanged")
        overlap = await expect_error(
            save(1, [rule(), rule(min_litres=1500, max_litres=None)]), 422, "price_rules_overlap"
        )
        assert overlap.details == [
            {
                "loc": ["body", "rules", 1],
                "msg": "Overlaps rules[0] (600 to 1,999 litres)",
                "type": "value_error",
            }
        ]
        await expect_error(save(1, [rule(zone_id=uuid.uuid4())]), 404, "service_zone_not_found")
        await expect_error(
            save(1, [rule(water_category_id=uuid.uuid4())]), 404, "water_category_not_found"
        )
        # The same band is fine for a different zone or category.
        zone = await new_zone(sessions, zone_ids, admin)
        async with sessions() as session:
            saved = await price_lists.save_price_list(
                session,
                actor=admin,
                base_version=1,
                reason=None,
                rules=[rule(), LARGE, rule(zone_id=zone.zone.id)],
            )
        assert saved.version.version == 2

    run(scenario)


def test_concurrent_saves_create_one_version(created: Created, zone_ids: list[uuid.UUID]) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)

        async def attempt(fee: int) -> object:
            async with sessions() as session:
                try:
                    return await price_lists.save_price_list(
                        session,
                        actor=admin,
                        base_version=None,
                        reason=None,
                        rules=[rule(base_delivery_fee_minor_units=fee)],
                    )
                except APIError as error:
                    return error

        results = await asyncio.gather(*(attempt(100_000 + i) for i in range(4)))
        saved = [r for r in results if not isinstance(r, APIError)]
        refused = [r for r in results if isinstance(r, APIError)]
        assert len(saved) == 1
        assert {(e.status_code, e.code) for e in refused} == {(409, "price_list_changed")}

    run(scenario)


def test_matching_prefers_the_zone_then_the_category(
    created: Created, zone_ids: list[uuid.UUID]
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        category = await utility(sessions)
        zone = await new_zone(sessions, zone_ids, admin)
        other_zone = await new_zone(sessions, zone_ids, admin)
        rules = [
            rule(),  # every zone, every category, 600-1,999
            LARGE,  # every zone, every category, 2,000+
            rule(zone_id=zone.zone.id, min_litres=600, max_litres=None),  # this zone
            rule(
                zone_id=zone.zone.id,
                water_category_id=category.id,
                min_litres=3000,
                max_litres=None,
            ),
        ]
        async with sessions() as session:
            await price_lists.save_price_list(
                session, actor=admin, base_version=None, reason=None, rules=rules
            )

        async def match(zone_id: uuid.UUID | None, litres: int) -> int | None:
            async with sessions() as session:
                found = await price_lists.match_price_rule(
                    session, zone_id=zone_id, water_category_id=category.id, litres=litres
                )
            return found.rule.position if found else None

        assert await match(other_zone.zone.id, 600) == 0
        assert await match(other_zone.zone.id, 1999) == 0
        assert await match(other_zone.zone.id, 2000) == 1
        assert await match(None, 2500) == 1
        assert await match(zone.zone.id, 2500) == 2  # the zone's own rule beats every-zone
        assert await match(zone.zone.id, 3000) == 3  # zone and category beat zone only

    run(scenario)


def test_no_price_list_or_no_band_is_no_match(created: Created, zone_ids: list[uuid.UUID]) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        category = await utility(sessions)
        async with sessions() as session:
            assert (
                await price_lists.match_price_rule(
                    session, zone_id=None, water_category_id=category.id, litres=600
                )
                is None
            )
        async with sessions() as session:
            await price_lists.save_price_list(
                session, actor=admin, base_version=None, reason=None, rules=[rule()]
            )
        async with sessions() as session:
            # 2,000 L is outside the only band (600-1,999): a manual quote, never a guess.
            assert (
                await price_lists.match_price_rule(
                    session, zone_id=None, water_category_id=category.id, litres=2000
                )
                is None
            )

    run(scenario)
