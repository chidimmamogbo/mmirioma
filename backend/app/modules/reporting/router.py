"""Admin shell and settings endpoints (docs/api/admin-operations.md).

``CurrentAdmin`` only, so customers and drivers get 403 ``forbidden``
(FR-001). Both are reads; settings cannot be saved in the app (contract
decision 4). Handlers only translate between HTTP and
:mod:`app.modules.reporting.service`.
"""

from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.errors import ErrorResponse
from app.modules.auth.dependencies import CurrentAdmin
from app.modules.reporting import service
from app.modules.reporting.schemas import (
    AdminSettingsRead,
    AdminShellRead,
    StaffMemberRead,
    SupportSettingsRead,
)

router = APIRouter(prefix="/admin", tags=["admin overview"])

DbSession = Annotated[AsyncSession, Depends(get_db_session)]

_AUTH_ERRORS: dict[int | str, dict[str, object]] = {
    HTTPStatus.UNAUTHORIZED: {"model": ErrorResponse},
    HTTPStatus.FORBIDDEN: {"model": ErrorResponse},
}


@router.get("/shell", responses=_AUTH_ERRORS)
async def get_shell(admin: CurrentAdmin, db: DbSession) -> AdminShellRead:
    """The sidebar badges and the header bell for the signed-in admin."""
    counts = await service.shell_counts(db, admin)
    return AdminShellRead(
        orders_needing_action=counts.orders_needing_action,
        support_requests_open=counts.support_requests_open,
        notifications_unread=counts.notifications_unread,
    )


@router.get("/settings", responses=_AUTH_ERRORS)
async def get_settings_page(admin: CurrentAdmin, db: DbSession) -> AdminSettingsRead:
    """The support contact, the delivery code validity and the staff, read only."""
    settings = await service.admin_settings(db)
    return AdminSettingsRead(
        support=SupportSettingsRead(
            phone=settings.support_phone, whatsapp_enabled=settings.whatsapp_enabled
        ),
        delivery_code_validity_minutes=settings.delivery_code_validity_minutes,
        staff=[
            StaffMemberRead(
                id=member.user.id,
                name=member.user.name,
                phone=member.user.phone,
                role="admin",
                last_sign_in_at=member.last_sign_in_at,
            )
            for member in settings.staff
        ],
    )
