"""Order feedback against a real, migrated database (FR-051).

docs/api/customer-account.md, "Order feedback": only a delivered order of
the signed-in customer can be rated; submitting again replaces the one row;
the rating range is enforced by the database too; anonymizing the order
blanks the message and keeps the answers.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Feedback goes with its order (ON DELETE CASCADE), so the dispatch tests'
cleanup removes it.
"""

from datetime import UTC, datetime
from http import HTTPStatus

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.errors import APIError
from app.modules.auth.models import User, UserRole
from app.modules.orders import retention
from app.modules.orders import service as orders_service
from app.modules.orders.models import Order, OrderFeedback, OrderStatus
from tests import test_dispatch_integration as dispatch_tests
from tests.test_dispatch_integration import Created, add_user
from tests.test_orders_integration import TEST_DATABASE_URL, new_order, run

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created = dispatch_tests.created
Sessions = async_sessionmaker[AsyncSession]

ANSWERS = orders_service.FeedbackAnswers(
    rating=5,
    poured_by_partner=True,
    on_time=True,
    quantity_as_ordered=None,
    would_reorder=True,
    message="Very polite rider.",
)


async def order_in(sessions: Sessions, customer: User, status: OrderStatus) -> Order:
    """A new order of ``customer``, put straight into ``status``.

    The delivery steps are tested elsewhere; feedback only reads the status.
    """
    async with sessions() as session:
        order, _ = await orders_service.create_order(
            session, customer_id=customer.id, request=new_order()
        )
        await session.execute(update(Order).where(Order.id == order.id).values(status=status))
        await session.commit()
    return order


async def put(
    sessions: Sessions,
    customer: User,
    reference: str,
    answers: orders_service.FeedbackAnswers = ANSWERS,
) -> tuple[OrderFeedback, bool]:
    async with sessions() as session:
        return await orders_service.put_feedback(
            session, customer_id=customer.id, reference=reference, answers=answers
        )


async def expect_error(code: str, status: HTTPStatus, coroutine: object) -> None:
    with pytest.raises(APIError) as caught:
        await coroutine  # type: ignore[misc]
    assert (caught.value.code, caught.value.status_code) == (code, status)


def test_first_submission_creates_and_a_second_replaces_the_one_row(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        order = await order_in(sessions, customer, OrderStatus.DELIVERED)

        first, was_created = await put(sessions, customer, order.reference)
        assert was_created is True
        assert (first.rating, first.quantity_as_ordered, first.message) == (
            5,
            None,
            "Very polite rider.",
        )

        changed = orders_service.FeedbackAnswers(
            rating=2,
            poured_by_partner=False,
            on_time=False,
            quantity_as_ordered=False,
            would_reorder=None,
            message=None,
        )
        second, was_created = await put(sessions, customer, order.reference, changed)
        assert was_created is False
        assert second.id == first.id
        assert (second.rating, second.poured_by_partner, second.message) == (2, False, None)
        assert second.created_at == first.created_at
        assert second.updated_at >= first.updated_at

        async with sessions() as session:
            rows = list(
                await session.scalars(
                    select(OrderFeedback).where(OrderFeedback.order_id == order.id)
                )
            )
            lookups = await orders_service.read_lookups(session, [order], with_feedback=True)
            staff = await orders_service.read_lookups(session, [order])
        assert len(rows) == 1
        assert lookups.feedback[order.id].rating == 2
        assert staff.feedback == {}

    run(scenario)


@pytest.mark.parametrize(
    "status",
    [OrderStatus.QUOTE_REQUESTED, OrderStatus.EN_ROUTE, OrderStatus.CANCELLED, OrderStatus.FAILED],
)
def test_only_a_delivered_order_can_be_rated(created: Created, status: OrderStatus) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        order = await order_in(sessions, customer, status)
        await expect_error(
            "order_not_delivered", HTTPStatus.CONFLICT, put(sessions, customer, order.reference)
        )

    run(scenario)


def test_another_customers_or_unknown_order_is_not_found(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        owner = await add_user(sessions, created, UserRole.CUSTOMER)
        stranger = await add_user(sessions, created, UserRole.CUSTOMER)
        order = await order_in(sessions, owner, OrderStatus.DELIVERED)
        await expect_error(
            "order_not_found", HTTPStatus.NOT_FOUND, put(sessions, stranger, order.reference)
        )
        await expect_error(
            "order_not_found", HTTPStatus.NOT_FOUND, put(sessions, owner, "MO-NOTANORDER")
        )

    run(scenario)


def test_the_database_enforces_one_row_and_the_rating_range(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        rated = await order_in(sessions, customer, OrderStatus.DELIVERED)
        unrated = await order_in(sessions, customer, OrderStatus.DELIVERED)
        await put(sessions, customer, rated.reference)

        # A second row for the same order (uq_feedback_order_id).
        with pytest.raises(IntegrityError):
            async with sessions() as session:
                session.add(OrderFeedback(order_id=rated.id, rating=4, poured_by_partner=True))
                await session.commit()
        # A rating outside 1-5 (ck_feedback_rating_range).
        with pytest.raises(IntegrityError):
            async with sessions() as session:
                session.add(OrderFeedback(order_id=unrated.id, rating=9, poured_by_partner=True))
                await session.commit()

    run(scenario)


def test_anonymizing_the_order_blanks_the_message_and_keeps_the_answers(
    created: Created,
) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        order = await order_in(sessions, customer, OrderStatus.DELIVERED)
        await put(sessions, customer, order.reference)
        async with sessions() as session:
            await retention.anonymize_orders(session, order_ids=[order.id], now=datetime.now(UTC))
            await session.commit()
        async with sessions() as session:
            row = await session.scalar(
                select(OrderFeedback).where(OrderFeedback.order_id == order.id)
            )
        assert row is not None
        assert (row.message, row.rating, row.would_reorder) == (None, 5, True)

    run(scenario)
