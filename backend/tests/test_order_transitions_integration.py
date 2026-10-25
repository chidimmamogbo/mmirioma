"""transition_order against a real, migrated database (FR-033, docs/api/deliveries.md).

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Accounts use random fictional numbers and are deleted afterwards with their
orders and events (``created_user_ids`` fixture).
"""

import asyncio
import secrets
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.errors import APIError
from app.modules.auth.models import User, UserRole
from app.modules.orders import service
from app.modules.orders.models import Order, OrderEvent, OrderStatus, TransitionReason
from app.modules.orders.transitions import Requirement
from tests.test_orders_integration import (
    TEST_DATABASE_URL,
    add_customer,
    created_user_ids,  # noqa: F401  # fixture
    new_order,
    run,
)

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

S = OrderStatus
Q = Requirement
R = TransitionReason

# What a confirmed pay-on-delivery order would have proved (rows 4 and 8).
CONFIRMABLE = {
    Q.QUOTE_ACCEPTED,
    Q.PAY_ON_DELIVERY,
    Q.PHONE_VERIFIED,
    Q.SOURCE_ELIGIBLE,
    Q.SLOT_RESERVED,
}


async def add_staff(
    sessions: async_sessionmaker[AsyncSession], user_ids: list[uuid.UUID], role: UserRole
) -> User:
    phone = "+234809" + "".join(secrets.choice("0123456789") for _ in range(7))
    user = User(name=f"Sample {role.value}", phone=phone, password_hash="unused", role=role)
    async with sessions() as session:
        session.add(user)
        await session.commit()
    user_ids.append(user.id)
    return user


async def load(sessions: async_sessionmaker[AsyncSession], model: type, user_id: uuid.UUID):  # type: ignore[no-untyped-def]
    async with sessions() as session:
        return await session.get(model, user_id)


async def assigned_order(
    sessions: async_sessionmaker[AsyncSession], user_ids: list[uuid.UUID]
) -> tuple[Order, User, User, User]:
    """Create an order and move it to ``assigned``; return order, customer, admin, driver."""
    customer_id = await add_customer(sessions, user_ids)
    admin = await add_staff(sessions, user_ids, UserRole.ADMIN)
    driver = await add_staff(sessions, user_ids, UserRole.DRIVER)
    async with sessions() as session:
        customer = await session.get(User, customer_id)
        assert customer is not None
        order, _ = await service.create_order(session, customer_id=customer_id, request=new_order())
        await service.transition_order(
            session, order_id=order.id, target=S.CONFIRMED, actor=customer, satisfied=CONFIRMABLE
        )
        order = await service.transition_order(
            session,
            order_id=order.id,
            target=S.ASSIGNED,
            actor=admin,
            satisfied={Q.DRIVER_ELIGIBLE},
        )
    return order, customer, admin, driver


async def events(
    sessions: async_sessionmaker[AsyncSession], order_id: uuid.UUID
) -> list[OrderEvent]:
    async with sessions() as session:
        return list(
            await session.scalars(
                select(OrderEvent)
                .where(OrderEvent.order_id == order_id)
                .order_by(OrderEvent.created_at, OrderEvent.id)
            )
        )


def test_transitions_are_applied_and_recorded(created_user_ids: list[uuid.UUID]) -> None:  # noqa: F811
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        order, customer, admin, driver = await assigned_order(sessions, created_user_ids)
        async with sessions() as session:
            cancelled = await service.transition_order(
                session,
                order_id=order.id,
                target=S.CANCELLED,
                actor=admin,
                reason_code=R.OTHER,
                note="Sample: duplicate request",
            )
        assert cancelled.status is S.CANCELLED
        history = await events(sessions, order.id)
        assert [(e.from_status, e.to_status) for e in history] == [
            (None, S.QUOTE_REQUESTED),
            (S.QUOTE_REQUESTED, S.CONFIRMED),
            (S.CONFIRMED, S.ASSIGNED),
            (S.ASSIGNED, S.CANCELLED),
        ]
        assert [e.actor_id for e in history] == [customer.id, customer.id, admin.id, admin.id]
        assert (history[-1].reason_code, history[-1].note) == (R.OTHER, "Sample: duplicate request")

    run(scenario)


def test_t07_only_the_owner_or_the_assigned_driver_may_act(
    created_user_ids: list[uuid.UUID],  # noqa: F811
) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        order, _, _, driver = await assigned_order(sessions, created_user_ids)
        other_driver = await add_staff(sessions, created_user_ids, UserRole.DRIVER)
        other_customer = await load(sessions, User, await add_customer(sessions, created_user_ids))

        async with sessions() as session:
            for actor, assigned in [
                (other_driver, driver.id),
                (driver, None),
                (other_customer, None),
            ]:
                with pytest.raises(APIError) as raised:
                    await service.transition_order(
                        session,
                        order_id=order.id,
                        target=S.ACCEPTED if actor.role is UserRole.DRIVER else S.CANCELLED,
                        actor=actor,
                        reason_code=None if actor.role is UserRole.DRIVER else R.CUSTOMER_REQUEST,
                        assigned_driver_id=assigned,
                    )
                assert (raised.value.status_code, raised.value.code) == (404, "order_not_found")
                await session.rollback()

            accepted = await service.transition_order(
                session,
                order_id=order.id,
                target=S.ACCEPTED,
                actor=driver,
                assigned_driver_id=driver.id,
            )
        assert accepted.status is S.ACCEPTED

    run(scenario)


def test_repeating_the_same_step_writes_one_event(created_user_ids: list[uuid.UUID]) -> None:  # noqa: F811
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        order, _, _, driver = await assigned_order(sessions, created_user_ids)
        for _ in range(2):
            async with sessions() as session:
                result = await service.transition_order(
                    session,
                    order_id=order.id,
                    target=S.ACCEPTED,
                    actor=driver,
                    assigned_driver_id=driver.id,
                )
                assert result.status is S.ACCEPTED
        accepted = [e for e in await events(sessions, order.id) if e.to_status is S.ACCEPTED]
        assert len(accepted) == 1

    run(scenario)


def test_t08_delivered_without_proof_is_rejected_and_nothing_changes(
    created_user_ids: list[uuid.UUID],  # noqa: F811
) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        order, _, _, driver = await assigned_order(sessions, created_user_ids)
        steps = [
            (S.ACCEPTED, set()),
            (S.DEPARTED, set()),
            (S.COLLECTED, {Q.PICKUP_RECORDED}),
            (S.EN_ROUTE, set()),
            (S.ARRIVED, set()),
            (S.UNLOADING, set()),
        ]
        async with sessions() as session:
            for target, satisfied in steps:
                await service.transition_order(
                    session,
                    order_id=order.id,
                    target=target,
                    actor=driver,
                    satisfied=satisfied,
                    assigned_driver_id=driver.id,
                )
            with pytest.raises(APIError) as raised:
                await service.transition_order(
                    session,
                    order_id=order.id,
                    target=S.DELIVERED,
                    actor=driver,
                    assigned_driver_id=driver.id,
                )
            assert raised.value.code == "transition_requirements_unmet"
            await session.rollback()
        stored = await load(sessions, Order, order.id)
        assert stored.status is S.UNLOADING
        assert all(e.to_status is not S.DELIVERED for e in await events(sessions, order.id))

    run(scenario)


def test_concurrent_accept_and_expiry_cannot_both_win(
    created_user_ids: list[uuid.UUID],  # noqa: F811
) -> None:
    # Accepting and the offer expiring both leave `assigned`; whichever runs
    # second must fail, because the row lock makes it see the first result.
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        order, _, _, driver = await assigned_order(sessions, created_user_ids)

        async def accept() -> object:
            async with sessions() as session:
                return await service.transition_order(
                    session,
                    order_id=order.id,
                    target=S.ACCEPTED,
                    actor=driver,
                    assigned_driver_id=driver.id,
                )

        async def expire() -> object:
            async with sessions() as session:
                return await service.transition_order(
                    session,
                    order_id=order.id,
                    target=S.CONFIRMED,
                    actor=None,
                    reason_code=R.ASSIGNMENT_EXPIRED,
                )

        results = await asyncio.gather(accept(), expire(), return_exceptions=True)
        failures = [r for r in results if isinstance(r, APIError)]
        assert len(failures) == 1, results
        assert failures[0].code in {"invalid_order_transition", "forbidden"}
        history = await events(sessions, order.id)
        assert sum(e.from_status is S.ASSIGNED for e in history) == 1

    run(scenario)


def test_database_accepts_new_statuses_and_rejects_unknown_reason_codes(
    created_user_ids: list[uuid.UUID],  # noqa: F811
) -> None:
    async def scenario(sessions: async_sessionmaker[AsyncSession]) -> None:
        order, _, _, _ = await assigned_order(sessions, created_user_ids)
        async with sessions() as session:
            for status in ("awaiting_payment", "departed", "arrived", "unloading"):
                await session.execute(
                    text("UPDATE orders SET status = :status WHERE id = :id"),
                    {"status": status, "id": order.id},
                )
            await session.rollback()
            with pytest.raises(IntegrityError):
                await session.execute(
                    text(
                        "INSERT INTO order_events (id, order_id, to_status, reason_code) "
                        "VALUES (:id, :order_id, 'cancelled', 'not_a_reason')"
                    ),
                    {"id": uuid.uuid4(), "order_id": order.id},
                )
            await session.rollback()

    run(scenario)
