"""Privacy steps on delivery records (NFR-005, #129).

Called by ``app.modules.privacy`` for ``docs/process/privacy-retention.md``.
Functions add to the caller's transaction and never commit.

- **GPS points** (FR-035) on arrivals and proofs are cleared when the
  customer is anonymized, and by the monthly review 90 days after they were
  recorded, unless the order has an open hold or review or is disputed: the
  point may be evidence (notice section 8).
- **Delivery codes:** a proof points at the code that confirmed it, so code
  rows stay; the review blanks the hash once the code has expired (notice
  section 8: "the scrambled code is deleted; the record that delivery was
  confirmed is kept").
- **Notes** written by drivers and staff are kept as incident and safety
  records; :func:`count_notes` and :func:`count_partner_notes` let the
  privacy contact review them.
- When a rider or driver is anonymized, the GPS points they recorded are
  cleared (:func:`clear_partner_gps`), with the same evidence exception
  (#119).
"""

import uuid
from collections.abc import Collection
from datetime import datetime
from typing import Any, cast

from sqlalchemy import CursorResult, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.deliveries.models import (
    DeliveryAttempt,
    DeliveryCode,
    DeliveryProof,
    OrderException,
    PickupRecord,
)

# A delivery code's hash once the review has removed it; no HMAC is empty.
CLEARED_CODE_HASH = ""


def _rowcount(result: object) -> int:
    # An UPDATE or DELETE returns a CursorResult; Session.execute is typed
    # with the general Result.
    return cast("CursorResult[Any]", result).rowcount


async def open_matter_order_ids(
    session: AsyncSession, *, order_ids: Collection[uuid.UUID] | None = None
) -> set[uuid.UUID]:
    """Orders with an unresolved hold or admin review (FR-035, FR-036).

    Ordinary incidents (for example "running late") are never resolved and
    do not count; a hold or a review that needs an administrator does.

    Args:
        session: Database session.
        order_ids: Limit the check to these orders; ``None`` checks all.

    Returns:
        The ids of the orders with an open matter.
    """
    query = select(OrderException.order_id).where(
        OrderException.resolved_at.is_(None),
        or_(OrderException.hold_kind.is_not(None), OrderException.requires_admin_review),
    )
    if order_ids is not None:
        if not order_ids:
            return set()
        query = query.where(OrderException.order_id.in_(order_ids))
    return set(await session.scalars(query.distinct()))


async def clear_order_gps(
    session: AsyncSession, *, order_ids: Collection[uuid.UUID], now: datetime
) -> int:
    """Clear every GPS point on these orders' arrivals and proofs.

    Args:
        session: Database session.
        order_ids: The orders (an anonymized customer's).
        now: Time of the change.

    Returns:
        How many points were cleared.
    """
    if not order_ids:
        return 0
    return await _clear_gps(session, now=now, order_filter=order_ids)


async def clear_old_gps(
    session: AsyncSession,
    *,
    recorded_before: datetime,
    keep_order_ids: Collection[uuid.UUID],
    now: datetime,
) -> int:
    """Clear GPS points recorded before a cutoff (notice section 8, 90 days).

    Args:
        session: Database session.
        recorded_before: Points on rows created before this are due.
        keep_order_ids: Orders whose points stay (disputed or with an open
            matter).
        now: Time of the change.

    Returns:
        How many points were cleared.
    """
    return await _clear_gps(
        session, now=now, recorded_before=recorded_before, keep_order_ids=keep_order_ids
    )


async def clear_partner_gps(
    session: AsyncSession,
    *,
    recorded_by: uuid.UUID,
    keep_order_ids: Collection[uuid.UUID],
    now: datetime,
) -> int:
    """Clear the GPS points a rider or driver recorded, when their account is anonymized.

    The location is their phone's, so it goes with them (#119), except on
    orders still needed as evidence: disputed, or with an open hold or
    review (notice section 8, the same exception as the monthly review).

    Args:
        session: Database session.
        recorded_by: The rider or driver.
        keep_order_ids: Orders whose points stay.
        now: Time of the change.

    Returns:
        How many points were cleared.
    """
    return await _clear_gps(
        session, now=now, recorded_by=recorded_by, keep_order_ids=keep_order_ids
    )


async def _clear_gps(
    session: AsyncSession,
    *,
    now: datetime,
    order_filter: Collection[uuid.UUID] | None = None,
    recorded_before: datetime | None = None,
    recorded_by: uuid.UUID | None = None,
    keep_order_ids: Collection[uuid.UUID] = (),
) -> int:
    cleared = 0
    for table, point, accuracy in (
        (
            DeliveryAttempt,
            DeliveryAttempt.arrival_location,
            DeliveryAttempt.arrival_accuracy_metres,
        ),
        (DeliveryProof, DeliveryProof.location, DeliveryProof.location_accuracy_metres),
    ):
        conditions = [point.is_not(None)]
        if order_filter is not None:
            conditions.append(table.order_id.in_(order_filter))
        if recorded_before is not None:
            conditions.append(table.created_at < recorded_before)
        if recorded_by is not None:
            conditions.append(table.recorded_by == recorded_by)
        if keep_order_ids:
            conditions.append(table.order_id.not_in(keep_order_ids))
        result = await session.execute(
            update(table)
            .where(*conditions)
            .values({point: None, accuracy: None, table.updated_at: now})
        )
        cleared += _rowcount(result)
    return cleared


async def clear_expired_delivery_codes(session: AsyncSession, *, now: datetime) -> int:
    """Blank the hash of every delivery code that expired before ``now``.

    A used or replaced code is also expired after its 10 minutes, so expiry
    alone selects them all.

    Args:
        session: Database session.
        now: The review's time.

    Returns:
        How many codes were cleared.
    """
    result = await session.execute(
        update(DeliveryCode)
        .where(DeliveryCode.expires_at < now, DeliveryCode.code_hash != CLEARED_CODE_HASH)
        .values(code_hash=CLEARED_CODE_HASH, updated_at=now)
    )
    return _rowcount(result)


async def count_notes(session: AsyncSession, *, order_ids: Collection[uuid.UUID]) -> int:
    """How many free-text notes drivers and staff wrote on these orders.

    Counts incident notes and decisions, proof notes and pickup safety
    notes, so the privacy contact can check them for personal details.
    """
    if not order_ids:
        return 0
    total = 0
    for table, columns in (
        (OrderException, (OrderException.note, OrderException.resolution_note)),
        (
            DeliveryProof,
            (
                DeliveryProof.alternative_note,
                DeliveryProof.override_note,
                DeliveryProof.customer_ack_note,
            ),
        ),
        (PickupRecord, (PickupRecord.safety_note,)),
    ):
        for column in columns:
            count = await session.scalar(
                select(func.count())
                .select_from(table)
                .where(table.order_id.in_(order_ids), column.is_not(None))
            )
            total += count or 0
    return total


async def count_partner_notes(session: AsyncSession, *, driver_id: uuid.UUID) -> int:
    """Count the free-text notes a rider or driver wrote, for the privacy contact to check.

    Incident notes and pickup safety notes are kept as safety records, like
    staff notes (#119); the anonymize report counts them so they can be
    checked by hand for personal details.

    Args:
        session: Database session.
        driver_id: The rider or driver.

    Returns:
        How many notes there are.
    """
    incidents = await session.scalar(
        select(func.count())
        .select_from(OrderException)
        .where(OrderException.reported_by == driver_id, OrderException.note.is_not(None))
    )
    pickups = await session.scalar(
        select(func.count())
        .select_from(PickupRecord)
        .where(PickupRecord.recorded_by == driver_id, PickupRecord.safety_note.is_not(None))
    )
    return (incidents or 0) + (pickups or 0)
