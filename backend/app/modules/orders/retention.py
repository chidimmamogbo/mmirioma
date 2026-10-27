"""Privacy steps on orders (NFR-005, #129).

Called by ``app.modules.privacy`` for ``docs/process/privacy-retention.md``.
Functions add to the caller's transaction and never commit.

Rules (technical lead, 2026-10-23, #129):

- An order is **finished** only when ``delivered`` or ``cancelled``. A
  ``failed`` order may still be rescheduled (row 21) and a ``disputed`` one
  is open, so both block anonymizing the customer; staff cancel a failed
  order that will not be rescheduled first.
- Anonymizing an order replaces the contact name and phone and the address,
  and clears the landmark, the instructions and the customer's feedback
  message (#82). Reference, quantities, statuses,
  times, source and price stay, for accounting and safety records.
- Free-text notes on order events are kept (incident records, notice
  section 8); :func:`count_event_notes` lets the privacy contact review them.
"""

import uuid
from collections.abc import Collection
from datetime import datetime
from typing import Any, cast

from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.orders.models import Order, OrderEvent, OrderFeedback, OrderStatus

FINISHED_STATUSES = frozenset({OrderStatus.DELIVERED, OrderStatus.CANCELLED})
ANONYMIZED_CONTACT_NAME = "Deleted"
# Not a real number: no E.164 number starts with +0 (auth.retention).
ANONYMIZED_CONTACT_PHONE = "+0" + "0" * 14
ANONYMIZED_ADDRESS = "Deleted"


async def customers_with_orders(
    session: AsyncSession, *, customer_ids: Collection[uuid.UUID]
) -> set[uuid.UUID]:
    """Which of these customers have at least one order."""
    if not customer_ids:
        return set()
    return set(
        await session.scalars(
            select(Order.customer_id).where(Order.customer_id.in_(customer_ids)).distinct()
        )
    )


async def unfinished_orders(
    session: AsyncSession, *, customer_id: uuid.UUID
) -> list[tuple[str, OrderStatus]]:
    """The customer's orders that are not finished, oldest first.

    Args:
        session: Database session.
        customer_id: The customer.

    Returns:
        ``(reference, status)`` for each order not delivered or cancelled.
    """
    rows = await session.execute(
        select(Order.reference, Order.status)
        .where(Order.customer_id == customer_id, Order.status.not_in(FINISHED_STATUSES))
        .order_by(Order.created_at)
    )
    return [(reference, status) for reference, status in rows]


async def customer_order_ids(session: AsyncSession, *, customer_id: uuid.UUID) -> list[uuid.UUID]:
    """Ids of all the customer's orders."""
    return list(await session.scalars(select(Order.id).where(Order.customer_id == customer_id)))


async def anonymize_orders(
    session: AsyncSession, *, order_ids: Collection[uuid.UUID], now: datetime
) -> int:
    """Remove the contact and address details from orders. Does not commit.

    Orders already anonymized are skipped, so running it twice changes
    nothing. The customer's feedback message on these orders is blanked too
    (docs/api/customer-account.md, "Data needed"); the ratings stay, as
    they hold no personal data.

    Args:
        session: Database session.
        order_ids: The orders.
        now: Time of the change (``updated_at``; bulk updates must set it).

    Returns:
        How many orders were changed.
    """
    if not order_ids:
        return 0
    result = await session.execute(
        update(Order)
        .where(Order.id.in_(order_ids), Order.delivery_address != ANONYMIZED_ADDRESS)
        .values(
            contact_name=ANONYMIZED_CONTACT_NAME,
            contact_phone=ANONYMIZED_CONTACT_PHONE,
            delivery_address=ANONYMIZED_ADDRESS,
            landmark=None,
            delivery_instructions=None,
            updated_at=now,
        )
    )
    await session.execute(
        update(OrderFeedback)
        .where(OrderFeedback.order_id.in_(order_ids), OrderFeedback.message.is_not(None))
        .values(message=None, updated_at=now)
    )
    # An UPDATE returns a CursorResult; Session.execute is typed with Result.
    return cast("CursorResult[Any]", result).rowcount


async def completed_order_ids(
    session: AsyncSession, *, completed_before: datetime
) -> list[uuid.UUID]:
    """Finished, not yet anonymized orders whose last status change is old.

    Notice section 8, "Order and delivery records" (3 years after the order
    is completed). The completion time is the order's latest status event,
    which later edits to the row do not move.

    Args:
        session: Database session.
        completed_before: Orders finished before this are due.

    Returns:
        Their ids.
    """
    last_change = (
        select(func.max(OrderEvent.created_at))
        .where(OrderEvent.order_id == Order.id)
        .correlate(Order)
        .scalar_subquery()
    )
    return list(
        await session.scalars(
            select(Order.id).where(
                Order.status.in_(FINISHED_STATUSES),
                Order.delivery_address != ANONYMIZED_ADDRESS,
                last_change < completed_before,
            )
        )
    )


async def disputed_order_ids(session: AsyncSession) -> list[uuid.UUID]:
    """Orders under dispute, whose evidence (GPS) the review must keep."""
    return list(await session.scalars(select(Order.id).where(Order.status == OrderStatus.DISPUTED)))


async def count_event_notes(session: AsyncSession, *, order_ids: Collection[uuid.UUID]) -> int:
    """How many status events on these orders carry a free-text note."""
    if not order_ids:
        return 0
    count = await session.scalar(
        select(func.count())
        .select_from(OrderEvent)
        .where(OrderEvent.order_id.in_(order_ids), OrderEvent.note.is_not(None))
    )
    return count or 0


async def order_references(session: AsyncSession, *, order_ids: Collection[uuid.UUID]) -> list[str]:
    """The references of these orders, sorted."""
    if not order_ids:
        return []
    return sorted(await session.scalars(select(Order.reference).where(Order.id.in_(order_ids))))
