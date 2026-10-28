"""The admin water category list against a real database (#161).

Contract: docs/api/admin-directory.md, "Amendment (#160): the list of water
categories" (agreed 2026-10-28). Covers the seeded categories, the order by
label, an inactive category being listed, and the rule that a zone fee may name
an inactive category (only an unknown id is 404 ``water_category_not_found``).

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Every row is created here and deleted afterwards.
"""

import secrets
import uuid

import pytest
from sqlalchemy import delete

from app.modules.auth.models import UserRole
from app.modules.pricing import service as pricing
from app.modules.pricing.models import ServiceZoneDeliveryFee
from app.modules.pricing.service import FeeInput
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
from tests.test_service_zones_integration import new_zone, zone_ids  # noqa: F401

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created = part1.created


async def add_inactive_category(sessions: Sessions) -> WaterCategory:
    """Insert a throwaway inactive category that sorts before the seeded ones."""
    suffix = secrets.token_hex(4)
    category = WaterCategory(
        code=f"sample-{suffix}",
        label=f"Aaa Sample Category {suffix}",
        supported_uses=None,
        is_active=False,
    )
    async with sessions() as session:
        session.add(category)
        await session.commit()
    return category


async def remove_category(sessions: Sessions, category: WaterCategory) -> None:
    async with sessions() as session:
        await session.execute(
            delete(ServiceZoneDeliveryFee).where(
                ServiceZoneDeliveryFee.water_category_id == category.id
            )
        )
        await session.execute(delete(WaterCategory).where(WaterCategory.id == category.id))
        await session.commit()


def test_lists_the_seeded_categories_by_label() -> None:
    async def scenario(sessions: Sessions) -> None:
        async with sessions() as session:
            listed = await pricing.list_water_categories(session)
        by_code = {category.code: category for category in listed}
        assert {"potable", "utility"} <= by_code.keys(), "migration 0011 seeds the categories"
        assert [category.label for category in listed] == sorted(
            (category.label for category in listed), key=str.casefold
        )
        # Every row has what the response shows: id, label and the flag.
        assert all(isinstance(category.is_active, bool) and category.label for category in listed)
        assert len({category.id for category in listed}) == len(listed)

    run(scenario)


def test_an_inactive_category_is_listed_first_by_its_label() -> None:
    async def scenario(sessions: Sessions) -> None:
        category = await add_inactive_category(sessions)
        try:
            async with sessions() as session:
                listed = await pricing.list_water_categories(session)
            assert listed[0].id == category.id
            assert (listed[0].label, listed[0].is_active) == (category.label, False)
        finally:
            await remove_category(sessions, category)

    run(scenario)


def test_a_zone_fee_may_name_an_inactive_category_but_not_an_unknown_one(
    created: Created,
    zone_ids: list[uuid.UUID],  # noqa: F811
) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        category = await add_inactive_category(sessions)
        try:
            view = await new_zone(sessions, zone_ids, admin, fees=[FeeInput(category.id, 150_000)])
            assert [(fee.water_category_id, fee.fee_minor_units) for fee in view.fees] == [
                (category.id, 150_000)
            ]
            await expect_error(
                new_zone(sessions, zone_ids, admin, fees=[FeeInput(uuid.uuid4(), 150_000)]),
                404,
                "water_category_not_found",
            )
        finally:
            await remove_category(sessions, category)

    run(scenario)
