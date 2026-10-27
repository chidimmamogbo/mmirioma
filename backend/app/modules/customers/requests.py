"""Support requests and account deletion requests (docs/api/customer-account.md).

Rules implemented here (contract "Support requests", "Account deletion" and
decisions 9-11):

- **Own records only** (FR-001): a customer reads and writes only their own
  requests. An ``order_reference`` that is not theirs is 404
  ``order_not_found``, the same as one that does not exist.
- **Support requests never change the order** (decision 9). Staff resolve
  them (admin endpoints, docs/api/admin-operations.md, #22).
- **Idempotent sending** (the FR-026 pattern): a retry with the same
  ``idempotency_key`` and the same details returns the stored request with
  200; the same key with different details is 409 ``idempotency_key_reused``.
- **One open deletion request**: asking again while one is ``received`` or
  ``acknowledged`` returns it with 200, never a second one. The account
  stays active; nothing is deleted until staff verify the request and run
  the privacy tool (privacy notice §9).
- **Acknowledge-by date**: the Lagos date 3 working days after the request,
  Monday to Friday, public holidays ignored (decision 11), so the date shown
  is never later than the notice promises.
- The deletion request is audited (NFR-004) without the reason text.

Each write locks the customer's ``users`` row first, so a double tap runs
one after the other.
"""

import secrets
import uuid
from datetime import date, datetime, timedelta
from http import HTTPStatus

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.modules.audit import service as audit_service
from app.modules.auth.models import User
from app.modules.customers.models import (
    OPEN_DELETION_STATUSES,
    DeletionRequest,
    DeletionRequestStatus,
    SupportRequest,
    SupportRequestType,
)
from app.modules.orders.models import Order
from app.modules.orders.service import IDEMPOTENCY_KEY_REUSED_MESSAGE, REFERENCE_ALPHABET
from app.shared.lagos_time import LAGOS_TZ

SUPPORT_PREFIX = "SR-"
DELETION_PREFIX = "DR-"
#: 8 Crockford base32 characters, about 40 bits, so references cannot be
#: guessed or counted (NFR-002).
REQUEST_RANDOM_LENGTH = 8
#: Privacy notice §9: "We acknowledge a request within 3 working days".
ACKNOWLEDGE_WORKING_DAYS = 3


def new_reference(prefix: str) -> str:
    """Return a random, public-safe request reference such as ``SR-4K7M2Q9X``.

    Args:
        prefix: ``SR-`` or ``DR-``.

    Returns:
        The reference.
    """
    return prefix + "".join(
        secrets.choice(REFERENCE_ALPHABET) for _ in range(REQUEST_RANDOM_LENGTH)
    )


def acknowledge_by(requested_at: datetime) -> date:
    """The Lagos date 3 working days after a request (decision 11).

    Working days are Monday to Friday; public holidays are ignored, so the
    date is never later than the notice promises. A request on Monday is
    acknowledged by Thursday; on Friday or at the weekend, by Wednesday.

    Args:
        requested_at: When the request was made (aware, any time zone).

    Returns:
        The acknowledge-by date in Africa/Lagos.
    """
    day = requested_at.astimezone(LAGOS_TZ).date()
    remaining = ACKNOWLEDGE_WORKING_DAYS
    while remaining:
        day += timedelta(days=1)
        if day.weekday() < 5:  # Monday-Friday
            remaining -= 1
    return day


# --- Support requests -------------------------------------------------------------------


async def list_support_requests(
    session: AsyncSession, customer: User, *, limit: int, offset: int
) -> tuple[list[tuple[SupportRequest, str | None]], int]:
    """Return a page of the customer's support requests, newest first.

    Args:
        session: Database session.
        customer: The signed-in customer.
        limit: Page size (1-100, checked by the router).
        offset: Rows to skip.

    Returns:
        ``(rows, total)``: each request with its order's reference, or None.
    """
    own = SupportRequest.user_id == customer.id
    rows = await session.execute(
        select(SupportRequest, Order.reference)
        .outerjoin(Order, Order.id == SupportRequest.order_id)
        .where(own)
        .order_by(SupportRequest.created_at.desc(), SupportRequest.id.desc())
        .limit(limit)
        .offset(offset)
    )
    total = await session.scalar(select(func.count()).select_from(SupportRequest).where(own))
    return [(request, reference) for request, reference in rows], total or 0


async def create_support_request(
    session: AsyncSession,
    customer: User,
    *,
    type: SupportRequestType,
    message: str,
    order_reference: str | None,
    idempotency_key: uuid.UUID,
) -> tuple[SupportRequest, str | None, bool]:
    """Store a support request, or return the one already sent with this key. Commits.

    Args:
        session: Database session.
        customer: The signed-in customer.
        type: What it is about.
        message: Trimmed, 3-1000 characters.
        order_reference: One of the customer's orders, or None.
        idempotency_key: The client's key for this form.

    Returns:
        ``(request, order_reference, created)``.

    Raises:
        APIError: 404 ``order_not_found``; 409 ``idempotency_key_reused``
            when the key was used for different details.
    """
    await _lock_customer(session, customer.id)
    order_id: uuid.UUID | None = None
    if order_reference is not None:
        order_id = await session.scalar(
            select(Order.id).where(
                Order.reference == order_reference, Order.customer_id == customer.id
            )
        )
        if order_id is None:
            raise APIError(HTTPStatus.NOT_FOUND, "order_not_found", "Order not found")

    existing = await session.scalar(
        select(SupportRequest).where(
            SupportRequest.user_id == customer.id,
            SupportRequest.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        await session.commit()  # release the lock
        if (existing.type, existing.message, existing.order_id) != (type, message, order_id):
            raise APIError(
                HTTPStatus.CONFLICT, "idempotency_key_reused", IDEMPOTENCY_KEY_REUSED_MESSAGE
            )
        return existing, order_reference, False

    request = SupportRequest(
        reference=new_reference(SUPPORT_PREFIX),
        user_id=customer.id,
        order_id=order_id,
        type=type,
        message=message,
        idempotency_key=idempotency_key,
    )
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return request, order_reference, True


# --- Deletion requests ------------------------------------------------------------------


async def request_deletion(
    session: AsyncSession, customer: User, *, reason: str | None
) -> tuple[DeletionRequest, bool]:
    """Record a deletion request, or return the open one. Commits.

    Deletes nothing; the account stays active (privacy notice §9).

    Args:
        session: Database session.
        customer: The signed-in customer.
        reason: Trimmed, up to 500 characters, or None.

    Returns:
        ``(request, created)``; created is False when an open request was
        returned instead.
    """
    await _lock_customer(session, customer.id)
    open_request = await _open_deletion_request(session, customer.id)
    if open_request is not None:
        await session.commit()  # release the lock
        return open_request, False

    request = DeletionRequest(
        id=uuid.uuid4(),
        reference=new_reference(DELETION_PREFIX),
        user_id=customer.id,
        reason=reason,
        acknowledge_by=acknowledge_by(datetime.now(LAGOS_TZ)),
    )
    session.add(request)
    await session.flush()
    # The reason stays on the request, never in the audit metadata.
    audit_service.record(
        session,
        actor_id=customer.id,
        action="deletion_requested",
        target_type="deletion_request",
        target_id=request.id,
    )
    await session.commit()
    await session.refresh(request)
    return request, True


async def get_open_deletion_request(session: AsyncSession, customer: User) -> DeletionRequest:
    """Return the customer's open deletion request.

    Args:
        session: Database session.
        customer: The signed-in customer.

    Returns:
        The ``received`` or ``acknowledged`` request.

    Raises:
        APIError: 404 ``deletion_request_not_found`` when there is none.
    """
    request = await _open_deletion_request(session, customer.id)
    if request is None:
        raise APIError(
            HTTPStatus.NOT_FOUND, "deletion_request_not_found", "No open deletion request"
        )
    return request


async def _open_deletion_request(
    session: AsyncSession, customer_id: uuid.UUID
) -> DeletionRequest | None:
    return await session.scalar(
        select(DeletionRequest).where(
            DeletionRequest.user_id == customer_id,
            DeletionRequest.status.in_(OPEN_DELETION_STATUSES),
        )
    )


async def _lock_customer(session: AsyncSession, customer_id: uuid.UUID) -> None:
    await session.execute(select(User.id).where(User.id == customer_id).with_for_update())


# --- Deletion request status (privacy tool) ---------------------------------------------

#: Which status each new status may follow (technical lead, 2026-10-27, #82):
#: received → acknowledged → completed, and refused from either open status.
#: Completed and refused are final.
ALLOWED_PREVIOUS: dict[DeletionRequestStatus, frozenset[DeletionRequestStatus]] = {
    DeletionRequestStatus.ACKNOWLEDGED: frozenset({DeletionRequestStatus.RECEIVED}),
    DeletionRequestStatus.COMPLETED: frozenset({DeletionRequestStatus.ACKNOWLEDGED}),
    DeletionRequestStatus.REFUSED: frozenset(OPEN_DELETION_STATUSES),
}


class DeletionStatusRefused(Exception):
    """The status change is not allowed; the message says why, for the privacy contact."""


async def get_deletion_request_for_update(
    session: AsyncSession, *, reference: str
) -> DeletionRequest:
    """Load a deletion request by reference and lock it (privacy tool).

    Raises:
        LookupError: No request has this reference.
    """
    request = await session.scalar(
        select(DeletionRequest).where(DeletionRequest.reference == reference).with_for_update()
    )
    if request is None:
        raise LookupError("no deletion request has this reference")
    return request


def set_deletion_status(
    request: DeletionRequest,
    *,
    status: DeletionRequestStatus,
    handled_by: uuid.UUID,
    now: datetime,
    refusal_reason: str | None,
    account_anonymized: bool,
) -> None:
    """Move a deletion request to a new status (contract decision 10). Does not commit.

    Rules (technical lead, 2026-10-27, #82): ``received`` → ``acknowledged``
    → ``completed``; ``refused`` from ``received`` or ``acknowledged``, with
    a reason; ``completed`` and ``refused`` are final. ``completed`` is
    accepted only once the account has been anonymized, so the app never
    records a deletion as done when it is not.

    Args:
        request: The locked request.
        status: The new status (not ``received``).
        handled_by: The admin making the change.
        now: Time of the change.
        refusal_reason: Required for ``refused``, trimmed, 5-500 characters
            (checked by the caller); ignored otherwise.
        account_anonymized: Whether the customer's account is anonymized.

    Raises:
        DeletionStatusRefused: The change breaks one of the rules above.
    """
    allowed = ALLOWED_PREVIOUS.get(status)
    if allowed is None:
        raise DeletionStatusRefused(f"a request cannot be set to {status.value}")
    if request.status not in allowed:
        raise DeletionStatusRefused(
            f"a {request.status.value} request cannot become {status.value}"
        )
    if status is DeletionRequestStatus.COMPLETED and not account_anonymized:
        raise DeletionStatusRefused(
            "the account is not anonymized yet: run anonymize-customer --apply first"
        )
    if status is DeletionRequestStatus.REFUSED and not refusal_reason:
        raise DeletionStatusRefused("a refusal needs a reason")

    request.status = status
    request.handled_by = handled_by
    if status is DeletionRequestStatus.ACKNOWLEDGED:
        request.acknowledged_at = now
    elif status is DeletionRequestStatus.COMPLETED:
        request.completed_at = now
    else:
        request.refused_at = now
        request.refusal_reason = refusal_reason
