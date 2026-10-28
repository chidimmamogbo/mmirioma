"""Privacy steps on a rider's or driver's dispatch records (NFR-005, #119).

Called by ``app.modules.privacy`` for ``docs/process/privacy-retention.md``
("Deletion", riders and drivers). Functions add to the caller's transaction
and never commit, so a dry run can roll them back.

Rules confirmed by the privacy contact on #119 (2026-10-27):

- **Assignments are kept**: they record who did which job (safety and
  accounting), so they keep pointing at the anonymized account. Only the
  partner's own words on a decline are replaced.
- **The driver profile row is kept** with its approval status as a
  historical record; the plate, declared capacity, availability, alert and
  SMS switches and transfer methods are removed or reset, and the service
  zones deleted. The account itself is deactivated by ``auth.retention``.
"""

import uuid
from typing import Any, cast

from sqlalchemy import CursorResult, and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.dispatch.models import (
    LIVE_ASSIGNMENT_STATUSES,
    Assignment,
    AssignmentStatus,
    DriverProfile,
    DriverServiceZone,
)
from app.modules.orders.models import Order

#: Replaces a partner's decline note when the account is anonymized.
REMOVED_PARTNER_TEXT = "Removed at the partner's request."


def _rowcount(result: object) -> int:
    # An UPDATE or DELETE returns a CursorResult; Session.execute is typed
    # with the general Result.
    return cast("CursorResult[Any]", result).rowcount


async def worked_order_ids(session: AsyncSession, *, driver_id: uuid.UUID) -> list[uuid.UUID]:
    """The orders the partner accepted at some point (their jobs, not just offers).

    Accepted means ``accepted`` or ``completed``, or ``withdrawn`` after
    acceptance (withdrawing keeps the acceptance time in ``responded_at``),
    the same rule as ``dispatch.service.accepted_driver``.

    Args:
        session: Database session.
        driver_id: The rider or driver.

    Returns:
        The order ids.
    """
    was_accepted = or_(
        Assignment.status.in_((AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED)),
        and_(
            Assignment.status == AssignmentStatus.WITHDRAWN,
            Assignment.responded_at.is_not(None),
        ),
    )
    return list(
        await session.scalars(
            select(Assignment.order_id)
            .where(Assignment.driver_user_id == driver_id, was_accepted)
            .distinct()
        )
    )


async def live_job_references(session: AsyncSession, *, driver_id: uuid.UUID) -> list[str]:
    """References of the partner's live jobs (offered or accepted), which block anonymizing.

    Args:
        session: Database session.
        driver_id: The rider or driver.

    Returns:
        ``"<reference>: job <status>"`` lines, sorted.
    """
    rows = await session.execute(
        select(Order.reference, Assignment.status)
        .join(Order, Order.id == Assignment.order_id)
        .where(
            Assignment.driver_user_id == driver_id,
            Assignment.status.in_(LIVE_ASSIGNMENT_STATUSES),
        )
    )
    return sorted(f"{reference}: job {status.value}" for reference, status in rows)


async def clear_profile(session: AsyncSession, *, driver_id: uuid.UUID) -> int:
    """Remove the partner's vehicle and preference details; delete their zones.

    The profile row and its approval status stay (historical record).

    Args:
        session: Database session (the caller's transaction).
        driver_id: The rider or driver.

    Returns:
        How many service zones were removed.
    """
    profile_id = await session.scalar(
        select(DriverProfile.id).where(DriverProfile.user_id == driver_id)
    )
    if profile_id is None:
        return 0
    await session.execute(
        update(DriverProfile)
        .where(DriverProfile.id == profile_id)
        .values(
            plate=None,
            declared_capacity_gallons=None,
            is_available=False,
            transfer_methods=[],
            new_order_alerts=True,
            sms_updates=True,
            updated_at=func.now(),
        )
    )
    return _rowcount(
        await session.execute(
            delete(DriverServiceZone).where(DriverServiceZone.driver_profile_id == profile_id)
        )
    )


async def clear_decline_notes(session: AsyncSession, *, driver_id: uuid.UUID) -> int:
    """Replace the partner's own words on their declines. Running it twice changes nothing.

    Args:
        session: Database session (the caller's transaction).
        driver_id: The rider or driver.

    Returns:
        How many notes were replaced.
    """
    return _rowcount(
        await session.execute(
            update(Assignment)
            .where(
                Assignment.driver_user_id == driver_id,
                Assignment.decline_note.is_not(None),
                Assignment.decline_note != REMOVED_PARTNER_TEXT,
            )
            .values(decline_note=REMOVED_PARTNER_TEXT, updated_at=func.now())
        )
    )
