"""Notification bodies shared by customers and partners.

One shape for both apps (docs/api/customer-account.md, "Notifications", and
docs/api/partners.md, "Notifications"); only the path and the ``kind``
values differ.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.notifications.service import MARK_READ_MAX_IDS


class NotificationRead(BaseModel):
    """One in-app message."""

    id: uuid.UUID
    kind: str
    title: str
    body: str
    reference: str | None
    created_at: datetime
    read_at: datetime | None


class NotificationPageRead(BaseModel):
    """A page of notifications plus the unread count across all pages."""

    items: list[NotificationRead]
    unread_count: int
    total: int
    limit: int
    offset: int


class MarkReadRequest(BaseModel):
    """``POST /me/notifications/read`` and ``/driver/notifications/read``.

    No ``ids`` marks every unread one read.
    """

    model_config = ConfigDict(extra="forbid")

    ids: list[uuid.UUID] | None = Field(default=None, max_length=MARK_READ_MAX_IDS)
