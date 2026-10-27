"""Support and deletion requests against a real, migrated database.

docs/api/customer-account.md, "Support requests" and "Account deletion":
storing a request with an order, the idempotent retry and the reused key,
another customer's order, the page; one open deletion request, its
acknowledge-by date, the audit row without the reason, and the partial
unique index.

Runs only when TEST_DATABASE_URL is set (``alembic upgrade head`` first).
Requests are deleted before the dispatch tests' cleanup removes the orders
and users they point at.
"""

import uuid
from collections.abc import Iterator
from http import HTTPStatus

import psycopg
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.errors import APIError
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User, UserRole
from app.modules.customers import requests
from app.modules.customers.models import (
    DeletionRequest,
    DeletionRequestStatus,
    SupportRequestStatus,
    SupportRequestType,
)
from app.modules.orders import service as orders_service
from tests import test_dispatch_integration as dispatch_tests
from tests.test_dispatch_integration import Created, add_user
from tests.test_orders_integration import TEST_DATABASE_URL, new_order, run

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"),
]

Sessions = async_sessionmaker[AsyncSession]


created = dispatch_tests.created


@pytest.fixture(autouse=True)
def delete_requests(created: Created) -> Iterator[None]:
    """Delete this module's requests before ``created`` removes their orders and users.

    It depends on ``created``, so pytest tears it down first.
    """
    yield
    url = get_settings().sync_database_url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as connection:
        users = (created.user_ids,)
        connection.execute("DELETE FROM support_requests WHERE user_id = ANY(%s)", users)
        connection.execute("DELETE FROM deletion_requests WHERE user_id = ANY(%s)", users)
        connection.execute("DELETE FROM audit_logs WHERE actor_id = ANY(%s)", users)


async def send(
    sessions: Sessions,
    customer: User,
    *,
    key: uuid.UUID,
    message: str = "The water has not arrived yet.",
    order_reference: str | None = None,
) -> tuple[object, str | None, bool]:
    async with sessions() as session:
        return await requests.create_support_request(
            session,
            customer,
            type=SupportRequestType.LATE,
            message=message,
            order_reference=order_reference,
            idempotency_key=key,
        )


async def expect_error(code: str, status: HTTPStatus, coroutine: object) -> None:
    with pytest.raises(APIError) as caught:
        await coroutine  # type: ignore[misc]
    assert (caught.value.code, caught.value.status_code) == (code, status)


def test_support_request_with_an_order_then_retry_then_reused_key(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        async with sessions() as session:
            order, _ = await orders_service.create_order(
                session, customer_id=customer.id, request=new_order()
            )
        key = uuid.uuid4()

        first, reference, was_created = await send(
            sessions, customer, key=key, order_reference=order.reference
        )
        assert was_created is True and reference == order.reference
        assert first.reference.startswith("SR-")  # type: ignore[attr-defined]
        assert first.status is SupportRequestStatus.OPEN  # type: ignore[attr-defined]
        assert first.order_id == order.id  # type: ignore[attr-defined]

        again, _, was_created = await send(
            sessions, customer, key=key, order_reference=order.reference
        )
        assert was_created is False
        assert again.id == first.id  # type: ignore[attr-defined]

        await expect_error(
            "idempotency_key_reused",
            HTTPStatus.CONFLICT,
            send(sessions, customer, key=key, message="Something else entirely."),
        )

        async with sessions() as session:
            rows, total = await requests.list_support_requests(
                session, customer, limit=50, offset=0
            )
        assert total == 1
        assert [(row.reference, ref) for row, ref in rows] == [
            (first.reference, order.reference)  # type: ignore[attr-defined]
        ]

    run(scenario)


def test_another_customers_order_is_not_found(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        owner = await add_user(sessions, created, UserRole.CUSTOMER)
        stranger = await add_user(sessions, created, UserRole.CUSTOMER)
        async with sessions() as session:
            order, _ = await orders_service.create_order(
                session, customer_id=owner.id, request=new_order()
            )
        await expect_error(
            "order_not_found",
            HTTPStatus.NOT_FOUND,
            send(sessions, stranger, key=uuid.uuid4(), order_reference=order.reference),
        )
        async with sessions() as session:
            _, total = await requests.list_support_requests(session, stranger, limit=50, offset=0)
        assert total == 0

    run(scenario)


def test_one_open_deletion_request_with_its_date_and_audit_row(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        async with sessions() as session:
            with pytest.raises(APIError) as caught:
                await requests.get_open_deletion_request(session, customer)
        assert caught.value.code == "deletion_request_not_found"

        async with sessions() as session:
            first, was_created = await requests.request_deletion(
                session, customer, reason="Moving away"
            )
        assert was_created is True
        assert first.status is DeletionRequestStatus.RECEIVED
        assert first.reference.startswith("DR-")
        assert first.acknowledge_by == requests.acknowledge_by(first.created_at)

        async with sessions() as session:
            second, was_created = await requests.request_deletion(session, customer, reason=None)
            open_request = await requests.get_open_deletion_request(session, customer)
            audit = list(
                await session.scalars(select(AuditLog).where(AuditLog.target_id == first.id))
            )
        assert was_created is False
        assert second.id == first.id == open_request.id
        assert second.reason == "Moving away"  # the first request is kept as it was
        # The reason never goes in the audit metadata (NFR-004).
        assert [(row.action, row.actor_id, row.details) for row in audit] == [
            ("deletion_requested", customer.id, {})
        ]

    run(scenario)


def test_the_database_allows_one_open_deletion_request(created: Created) -> None:
    async def scenario(sessions: Sessions) -> None:
        customer = await add_user(sessions, created, UserRole.CUSTOMER)
        async with sessions() as session:
            first, _ = await requests.request_deletion(session, customer, reason=None)
        with pytest.raises(IntegrityError):
            async with sessions() as session:
                session.add(
                    DeletionRequest(
                        reference=requests.new_reference(requests.DELETION_PREFIX),
                        user_id=customer.id,
                        acknowledge_by=first.acknowledge_by,
                    )
                )
                await session.commit()

    run(scenario)
