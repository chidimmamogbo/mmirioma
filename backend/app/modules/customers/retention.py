"""Privacy steps on saved addresses (NFR-005).

Called by ``app.modules.privacy``. Saved addresses are profile data, kept
while the account is open and removed with it (privacy notice §8;
docs/api/customer-account.md, "Data needed"). The foreign key to ``users``
is RESTRICT, so the privacy tool must call :func:`delete_addresses` before it
deletes or anonymizes an account. Functions add to the caller's transaction
and never commit, so a dry run can roll them back.
"""

import uuid
from collections.abc import Collection
from typing import Any, cast

from sqlalchemy import CursorResult, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.customers.models import CustomerAddress


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
    # A DELETE returns a CursorResult; Session.execute is typed with Result.
    return cast("CursorResult[Any]", result).rowcount
