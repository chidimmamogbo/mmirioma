"""Create, list and mark in-app notifications (FR-050).

Other modules call :func:`add` inside their own transaction, so a message is
stored only if the action it reports is committed, and creating one never
changes an order's status (FR-050: "Channel failure SHALL not mutate actual
order status").
"""

import uuid
from collections.abc import Collection
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.models import Notification, NotificationChannel
from app.modules.orders.models import Order

#: Most ids one mark-read request may name (docs/api/partners.md).
MARK_READ_MAX_IDS = 100


@dataclass(frozen=True)
class NotificationView:
    """A notification with the public reference of its order, if any."""

    notification: Notification
    order_reference: str | None


@dataclass(frozen=True)
class NotificationPage:
    """One page of a user's notifications, newest first.

    Attributes:
        items: The page.
        total: Every notification of the user.
        unread_count: Unread notifications across all pages (the menu badge).
    """

    items: list[NotificationView]
    total: int
    unread_count: int


def add(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str,
    order_id: uuid.UUID | None = None,
) -> Notification:
    """Add an in-app notification to the caller's transaction. Does not commit.

    Args:
        session: The session the reported action is written in.
        user_id: The recipient.
        kind: The contract's kind, e.g. ``assigned``.
        title: Server text; never a delivery code.
        body: Server text; never a delivery code.
        order_id: The order it is about, if any.

    Returns:
        The new, unflushed row.
    """
    row = Notification(
        user_id=user_id,
        order_id=order_id,
        channel=NotificationChannel.IN_APP,
        kind=kind,
        title=title,
        body=body,
    )
    session.add(row)
    return row


async def list_for_user(
    session: AsyncSession, *, user_id: uuid.UUID, limit: int, offset: int
) -> NotificationPage:
    """Return one page of a user's notifications, newest first.

    Args:
        session: Database session.
        user_id: The signed-in user; only their own rows are read.
        limit: Page size (1-100, checked by the router).
        offset: Rows to skip.

    Returns:
        The page with its totals.
    """
    own = Notification.user_id == user_id
    rows = await session.execute(
        select(Notification, Order.reference)
        .outerjoin(Order, Order.id == Notification.order_id)
        .where(own)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
        .offset(offset)
    )
    total = await session.scalar(select(func.count()).select_from(Notification).where(own))
    return NotificationPage(
        items=[NotificationView(row, reference) for row, reference in rows],
        total=total or 0,
        unread_count=await unread_count(session, user_id=user_id),
    )


async def unread_count(session: AsyncSession, *, user_id: uuid.UUID) -> int:
    """Count a user's unread notifications across all pages (badges and the bell).

    Args:
        session: Database session.
        user_id: The user.

    Returns:
        The count.
    """
    unread = await session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )
    return unread or 0


async def mark_read(
    session: AsyncSession, *, user_id: uuid.UUID, ids: Collection[uuid.UUID] | None
) -> None:
    """Mark a user's unread notifications read and commit.

    Ids that do not exist or belong to someone else are ignored, so the
    endpoint cannot be used to probe other people's messages. Rows already
    read keep their first ``read_at``.

    Args:
        session: Database session.
        user_id: The signed-in user.
        ids: The notifications to mark, or None for every unread one.
    """
    statement = (
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC), updated_at=func.now())
    )
    if ids is not None:
        if not ids:
            return
        statement = statement.where(Notification.id.in_(set(ids)))
    await session.execute(statement)
    await session.commit()


async def delete_for_users(session: AsyncSession, *, user_ids: Collection[uuid.UUID]) -> int:
    """Delete these users' notifications. Does not commit.

    For the privacy tool: notifications follow the order's retention and are
    removed when the account is anonymized (docs/api/customer-account.md,
    decision 8). A deleted account loses them by ``ON DELETE CASCADE``.

    Args:
        session: Database session (the caller's transaction).
        user_ids: The accounts.

    Returns:
        How many were deleted.
    """
    if not user_ids:
        return 0
    result = await session.execute(delete(Notification).where(Notification.user_id.in_(user_ids)))
    return int(getattr(result, "rowcount", 0))
