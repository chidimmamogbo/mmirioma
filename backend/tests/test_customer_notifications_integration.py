"""Customer order messages against a real, migrated database (FR-050).

docs/api/customer-account.md, "What creates a notification": real order
creation and status changes write the customer's messages in the same
transaction; an offer (``assigned``) writes none (FR-032); a harmless repeat
writes no second message; the list returns them newest first with the unread
count, and marking read clears it.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Notifications go with their orders and users (ON DELETE CASCADE), so the
dispatch tests' cleanup removes them.
"""

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.auth.models import UserRole
from app.modules.dispatch import service as dispatch_service
from app.modules.notifications import service as notifications_service
from app.modules.orders import service as orders_service
from app.modules.orders.models import OrderStatus, TransitionReason
from tests import test_dispatch_integration as dispatch_tests
from tests.test_dispatch_integration import Created, add_driver, add_user, confirmed_order
from tests.test_orders_integration import TEST_DATABASE_URL, new_order, run

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

created = dispatch_tests.created
Sessions = async_sessionmaker[AsyncSession]


async def kinds_of(sessions: Sessions, customer_id: uuid.UUID) -> list[str]:
    """The customer's message kinds, oldest first."""
    async with sessions() as session:
        page = await notifications_service.list_for_user(
            session, user_id=customer_id, limit=100, offset=0
        )
    return [view.notification.kind for view in reversed(page.items)]


def test_a_request_gets_one_received_message(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        async with sessions() as session:
            order, _ = await orders_service.create_order(
                session, customer_id=customer.id, request=new_order()
            )
        async with sessions() as session:
            page = await notifications_service.list_for_user(
                session, user_id=customer.id, limit=50, offset=0
            )
        assert [view.notification.kind for view in page.items] == ["order_received"]
        assert page.items[0].order_reference == order.reference
        assert page.items[0].notification.title == "Request received"
        assert page.unread_count == 1

        # A retry with the same idempotency key returns the order, no new message.
        async with sessions() as session:
            again, created_now = await orders_service.create_order(
                session,
                customer_id=customer.id,
                request=new_order(idempotency_key=order.idempotency_key),
            )
        assert (again.id, created_now) == (order.id, False)
        assert await kinds_of(sessions, customer.id) == ["order_received"]

    run(scenario)


def test_status_changes_write_messages_but_an_offer_does_not(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        driver = await add_driver(sessions, created)
        order = await confirmed_order(sessions, created)
        customer_id = order.customer_id
        assert await kinds_of(sessions, customer_id) == ["order_received", "order_confirmed"]

        async with sessions() as session:
            await dispatch_service.assign_driver(
                session, order_id=order.id, driver_user_id=driver.id, admin=admin
            )
        # FR-032: nothing while the driver may still decline.
        assert await kinds_of(sessions, customer_id) == ["order_received", "order_confirmed"]

        for _ in range(2):  # the second accept is a harmless repeat
            async with sessions() as session:
                await dispatch_service.accept_assignment(session, order_id=order.id, driver=driver)
        assert await kinds_of(sessions, customer_id) == [
            "order_received",
            "order_confirmed",
            "rider_assigned",
        ]

        async with sessions() as session:
            page = await notifications_service.list_for_user(
                session, user_id=customer_id, limit=50, offset=0
            )
            assert page.unread_count == 3
            await notifications_service.mark_read(session, user_id=customer_id, ids=None)
        async with sessions() as session:
            page = await notifications_service.list_for_user(
                session, user_id=customer_id, limit=50, offset=0
            )
        assert page.unread_count == 0

    run(scenario)


def test_a_cancellation_writes_a_cancelled_message(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        admin = await add_user(sessions, created, UserRole.ADMIN)
        order = await confirmed_order(sessions, created)
        async with sessions() as session:
            await orders_service.transition_order(
                session,
                order_id=order.id,
                target=OrderStatus.CANCELLED,
                actor=admin,
                reason_code=TransitionReason.MMIRIOMA_UNABLE,
            )
        assert await kinds_of(sessions, order.customer_id) == [
            "order_received",
            "order_confirmed",
            "cancelled",
        ]

    run(scenario)
