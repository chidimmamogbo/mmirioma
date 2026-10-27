"""Admin notification endpoints (docs/api/admin-operations.md, "Notifications (admin)").

The header bell. The same shape and mark-read rules as the customer's
``/me/notifications`` and the partner's ``/driver/notifications``; only the
path and the ``kind`` values differ (:mod:`app.modules.notifications.admin_messages`).
``CurrentAdmin`` only, so customers and drivers get 403 ``forbidden``
(FR-001); the mark-read request also needs the CSRF header. Each admin reads
and marks only their own rows.
"""

from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentAdmin
from app.modules.notifications import service
from app.modules.notifications.schemas import (
    MarkReadRequest,
    NotificationPageRead,
    NotificationRead,
)
from app.modules.orders.schemas import PageParams

router = APIRouter(prefix="/admin", tags=["admin notifications"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

_AUTH_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
}


@router.get("/notifications", responses=_AUTH_ERRORS)
async def list_notifications(
    page: Annotated[PageParams, Query()], admin: CurrentAdmin, db: DbSession
) -> NotificationPageRead:
    """This admin's notifications, newest first, with the unread count."""
    result = await service.list_for_user(db, user_id=admin.id, limit=page.limit, offset=page.offset)
    return NotificationPageRead(
        items=[
            NotificationRead(
                id=view.notification.id,
                kind=view.notification.kind,
                title=view.notification.title,
                body=view.notification.body,
                reference=view.order_reference,
                created_at=view.notification.created_at,
                read_at=view.notification.read_at,
            )
            for view in result.items
        ],
        unread_count=result.unread_count,
        total=result.total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post("/notifications/read", status_code=HTTPStatus.NO_CONTENT, responses=_AUTH_ERRORS)
async def mark_notifications_read(
    admin: CurrentAdmin,
    db: DbSession,
    body: Annotated[MarkReadRequest | None, Body()] = None,
) -> Response:
    """Mark the given messages read, or every unread one with no ``ids``.

    Unknown ids and other people's ids are ignored, so nothing can be probed.
    """
    await service.mark_read(db, user_id=admin.id, ids=body.ids if body is not None else None)
    return Response(status_code=HTTPStatus.NO_CONTENT)
