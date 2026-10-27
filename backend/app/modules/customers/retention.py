"""Privacy steps on saved addresses, support and deletion requests (NFR-005).

Called by ``app.modules.privacy`` (docs/api/customer-account.md, "Data
needed"). Their foreign keys to ``users`` are RESTRICT, so the privacy tool
calls these before it deletes or anonymizes an account. Functions add to
the caller's transaction and never commit, so a dry run can roll them back.

- Saved addresses are profile data, removed with the account (notice §8).
- Support requests are complaints (notice §8: 3 years after resolution).
  Anonymizing an account replaces their messages; an account deleted by the
  review loses them; resolved requests over 3 years old are deleted
  (technical lead, 2026-10-27, #82).
- A deletion request's reason is blanked when the account is anonymized;
  the request itself is kept as the record of what was asked and done.
"""

import uuid
from collections.abc import Collection
from datetime import datetime
from typing import Any, cast

from sqlalchemy import CursorResult, delete, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customers.models import (
    CustomerAddress,
    DeletionRequest,
    SupportRequest,
    SupportRequestStatus,
)

#: Replaces a support request's message when the account is anonymized.
REMOVED_MESSAGE = "Removed at the customer's request."


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


async def clear_requests(session: AsyncSession, *, customer_ids: Collection[uuid.UUID]) -> int:
    """Remove the personal text from these customers' requests. Does not commit.

    Support request messages are replaced and deletion reasons blanked; the
    rows stay (complaint and request records). Staff resolution notes and
    refusal reasons are kept, as staff notes are elsewhere.

    Args:
        session: Database session (the caller's transaction).
        customer_ids: The customers.

    Returns:
        How many support request messages were replaced.
    """
    if not customer_ids:
        return 0
    result = await session.execute(
        update(SupportRequest)
        .where(
            SupportRequest.user_id.in_(customer_ids),
            SupportRequest.message != REMOVED_MESSAGE,
        )
        .values(message=REMOVED_MESSAGE, updated_at=func.now())
    )
    await session.execute(
        update(DeletionRequest)
        .where(DeletionRequest.user_id.in_(customer_ids), DeletionRequest.reason.is_not(None))
        .values(reason=None, updated_at=func.now())
    )
    return _rowcount(result)


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


def _rowcount(result: object) -> int:
    # An UPDATE or DELETE returns a CursorResult; Session.execute is typed
    # with the general Result.
    return cast("CursorResult[Any]", result).rowcount
