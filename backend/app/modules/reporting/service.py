"""Admin shell counts and read-only settings (docs/api/admin-operations.md).

This module owns no table. It reads the other modules through their service
functions (CLAUDE.md, Architecture): dispatch for the orders waiting on
staff, customers for open support requests, notifications for the bell, and
auth for the staff list.
"""

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.modules.auth import service as auth_service
from app.modules.auth.models import User
from app.modules.customers import requests as support_requests
from app.modules.deliveries.codes import CODE_LIFETIME
from app.modules.dispatch import service as dispatch_service
from app.modules.notifications import service as notifications_service


@dataclass(frozen=True)
class ShellCounts:
    """The sidebar badges and the header bell (``GET /admin/shell``).

    Attributes:
        orders_needing_action: Orders to confirm or assign next (FR-030,
            FR-031), simulated ones included: staff act on them too.
        support_requests_open: Support requests still open.
        notifications_unread: This admin's unread notifications.
    """

    orders_needing_action: int
    support_requests_open: int
    notifications_unread: int


@dataclass(frozen=True)
class AdminSettings:
    """What the read-only Settings page shows (``GET /admin/settings``).

    Attributes:
        support_phone: The ``SUPPORT_PHONE`` setting (FR-055), E.164.
        whatsapp_enabled: The ``SUPPORT_WHATSAPP_ENABLED`` setting.
        delivery_code_validity_minutes: The server constant (FR-035: 10
            minutes, final).
        staff: Active administrators by name.
    """

    support_phone: str
    whatsapp_enabled: bool
    delivery_code_validity_minutes: int
    staff: list[auth_service.StaffMember]


async def shell_counts(session: AsyncSession, admin: User) -> ShellCounts:
    """Return the shell badges for the signed-in admin.

    Args:
        session: Database session.
        admin: The signed-in admin, whose unread notifications are counted.

    Returns:
        The counts.
    """
    return ShellCounts(
        orders_needing_action=await dispatch_service.count_orders_needing_action(session),
        support_requests_open=await support_requests.count_open_support_requests(session),
        notifications_unread=await notifications_service.unread_count(session, user_id=admin.id),
    )


async def admin_settings(session: AsyncSession) -> AdminSettings:
    """Return the settings and staff list; nothing here can be changed in the app.

    Changing any value is a configuration or command-line change by the
    technical lead (contract decision 4).

    Args:
        session: Database session.

    Returns:
        The settings.
    """
    settings = get_settings()
    return AdminSettings(
        support_phone=settings.support_phone,
        whatsapp_enabled=settings.support_whatsapp_enabled,
        delivery_code_validity_minutes=int(CODE_LIFETIME.total_seconds() // 60),
        staff=await auth_service.list_staff(session),
    )
