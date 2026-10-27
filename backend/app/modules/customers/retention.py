"""Privacy steps on saved addresses, support and deletion requests (NFR-005).

Called by ``app.modules.privacy`` (docs/api/customer-account.md, "Data
needed"). Their foreign keys to ``users`` are RESTRICT, so the privacy tool
calls these before it deletes or anonymizes an account. Functions add to
the caller's transaction and never commit, so a dry run can roll them back.

- Saved addresses are profile data, removed with the account (notice §8).
- Support requests are complaints (notice §8: 3 years after resolution).
  Anonymizing an account replaces their messages and the staff's resolution
  notes, which can name the customer or their address
  (docs/api/admin-operations.md, "Data needed"; privacy contact, 2026-10-27,
  #117); an account deleted by the review loses them; resolved requests over
  3 years old are deleted (technical lead, 2026-10-27, #82).
- A deletion request's reason is blanked when the account is anonymized;
  the request itself is kept as the record of what was asked and done, and
  deleted 3 years after it was completed or refused (#118).
"""

import uuid
from collections.abc import Collection
from dataclasses import dataclass
from datetime import datetime
from typing import Any, cast

from sqlalchemy import CursorResult, delete, func, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customers.models import (
    CustomerAddress,
    DeletionRequest,
    DeletionRequestStatus,
    SupportRequest,
    SupportRequestStatus,
)

#: Replaces a support request's message, and its staff resolution note, when
#: the account is anonymized. The note is replaced rather than blanked, so a
#: resolved request still has a note and the admin response keeps its agreed
#: shape (``resolution.note`` is a string; #117).
REMOVED_MESSAGE = "Removed at the customer's request."


@dataclass(frozen=True)
class RequestsCleared:
    """What :func:`clear_requests` replaced.

    Attributes:
        messages: Support request messages replaced.
        resolution_notes: Staff resolution notes replaced.
    """

    messages: int
    resolution_notes: int


async def delete_addresses(session: AsyncSession, *, customer_ids: Collection[uuid.UUID]) -> int:
    """Delete every saved address of these customers. Does not commit.

    Args:
        session: Database session (the caller's transaction).
        customer_ids: The customers.

    Returns:
        How many addresses were deleted.
    """
    if not customer_ids:
        return 0
    result = await session.execute(
        delete(CustomerAddress).where(CustomerAddress.customer_id.in_(customer_ids))
    )
    return _rowcount(result)


async def clear_requests(
    session: AsyncSession, *, customer_ids: Collection[uuid.UUID]
) -> RequestsCleared:
    """Remove the personal text from these customers' requests. Does not commit.

    Support request messages and staff resolution notes are replaced by
    :data:`REMOVED_MESSAGE`, and deletion reasons blanked; the rows stay
    (complaint and request records). Refusal reasons on deletion requests
    are kept: they are the record of why staff refused, and no rule removes
    them. Running it twice changes nothing.

    Args:
        session: Database session (the caller's transaction).
        customer_ids: The customers.

    Returns:
        How many messages and notes were replaced.
    """
    if not customer_ids:
        return RequestsCleared(messages=0, resolution_notes=0)
    messages = await session.execute(
        update(SupportRequest)
        .where(
            SupportRequest.user_id.in_(customer_ids),
            SupportRequest.message != REMOVED_MESSAGE,
        )
        .values(message=REMOVED_MESSAGE, updated_at=func.now())
    )
    notes = await session.execute(
        update(SupportRequest)
        .where(
            SupportRequest.user_id.in_(customer_ids),
            SupportRequest.resolution_note.is_not(None),
            SupportRequest.resolution_note != REMOVED_MESSAGE,
        )
        .values(resolution_note=REMOVED_MESSAGE, updated_at=func.now())
    )
    await session.execute(
        update(DeletionRequest)
        .where(DeletionRequest.user_id.in_(customer_ids), DeletionRequest.reason.is_not(None))
        .values(reason=None, updated_at=func.now())
    )
    return RequestsCleared(messages=_rowcount(messages), resolution_notes=_rowcount(notes))


async def delete_requests(session: AsyncSession, *, customer_ids: Collection[uuid.UUID]) -> int:
    """Delete these customers' support and deletion requests. Does not commit.

    For accounts the review deletes (never verified, no orders).

    Args:
        session: Database session (the caller's transaction).
        customer_ids: The customers.

    Returns:
        How many support requests were deleted.
    """
    if not customer_ids:
        return 0
    await session.execute(delete(DeletionRequest).where(DeletionRequest.user_id.in_(customer_ids)))
    return _rowcount(
        await session.execute(
            delete(SupportRequest).where(SupportRequest.user_id.in_(customer_ids))
        )
    )


async def delete_resolved_support_requests(
    session: AsyncSession, *, resolved_before: datetime
) -> int:
    """Delete support requests resolved before a cutoff (notice §8). Does not commit.

    Args:
        session: Database session (the caller's transaction).
        resolved_before: Requests resolved before this are due.

    Returns:
        How many were deleted.
    """
    return _rowcount(
        await session.execute(
            delete(SupportRequest).where(
                SupportRequest.status == SupportRequestStatus.RESOLVED,
                SupportRequest.resolved_at < resolved_before,
            )
        )
    )


async def delete_handled_deletion_requests(
    session: AsyncSession, *, handled_before: datetime
) -> int:
    """Delete deletion requests completed or refused before a cutoff. Does not commit.

    Notice §8: kept 3 years after the request is completed or refused
    (privacy contact, 2026-10-27, #118), as the record that it was handled.
    Requests still ``received`` or ``acknowledged`` are never deleted: they
    are open work.

    Args:
        session: Database session (the caller's transaction).
        handled_before: Requests completed or refused before this are due.

    Returns:
        How many were deleted.
    """
    return _rowcount(
        await session.execute(
            delete(DeletionRequest).where(
                or_(
                    (DeletionRequest.status == DeletionRequestStatus.COMPLETED)
                    & (DeletionRequest.completed_at < handled_before),
                    (DeletionRequest.status == DeletionRequestStatus.REFUSED)
                    & (DeletionRequest.refused_at < handled_before),
                )
            )
        )
    )


def _rowcount(result: object) -> int:
    # An UPDATE or DELETE returns a CursorResult; Session.execute is typed
    # with the general Result.
    return cast("CursorResult[Any]", result).rowcount
