"""Response bodies of the admin shell and settings (docs/api/admin-operations.md)."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class AdminShellRead(BaseModel):
    """``GET /admin/shell``: the sidebar badges and the header bell."""

    orders_needing_action: int
    support_requests_open: int
    notifications_unread: int


class SupportSettingsRead(BaseModel):
    """The support contact, from backend settings only (FR-055)."""

    phone: str
    whatsapp_enabled: bool


class StaffMemberRead(BaseModel):
    """An administrator; ``role`` is always ``admin`` (one staff role)."""

    id: uuid.UUID
    name: str
    phone: str
    role: Literal["admin"]
    last_sign_in_at: datetime | None


class AdminSettingsRead(BaseModel):
    """``GET /admin/settings``, read only (contract decision 4)."""

    support: SupportSettingsRead
    delivery_code_validity_minutes: int
    staff: list[StaffMemberRead]
