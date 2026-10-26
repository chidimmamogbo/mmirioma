"""Notification persistence: the ``notifications`` table (SRS §5, FR-050).

One row per message to one user. The SRS entity holds every channel (SMS,
email, staff-operated); this table starts with the in-app channel only,
which the partner app reads (docs/api/partners.md, "Notifications") and the
customer app will read (docs/api/customer-account.md, #48). Other channels
add their values when they are built.

``title`` and ``body`` are the text the user saw, written by the server from
a template. They never contain a delivery code (SRS §5 ``notifications``)
and never promise unverified delivery or water quality (FR-050).
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Enum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin

KIND_MAX_LENGTH = 30
TITLE_MAX_LENGTH = 120
BODY_MAX_LENGTH = 500


class NotificationChannel(StrEnum):
    """How the message reached the user. Only ``in_app`` exists yet."""

    IN_APP = "in_app"


class Notification(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One message to one user.

    Attributes:
        user_id: The recipient; rows go with the account.
        order_id: The order the message is about, if any.
        channel: :class:`NotificationChannel`.
        kind: What happened, e.g. ``assigned``. Free text so each app's
            contract owns its kinds; clients never fail on one they do not
            know.
        title: Server text shown as the heading.
        body: Server text shown under it.
        read_at: When the user marked it read (UTC); null while unread.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        # The list and the unread count read one user's rows, newest first.
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True, default=None
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        Enum(
            NotificationChannel,
            name="notification_channel",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda channels: [channel.value for channel in channels],
        ),
        default=NotificationChannel.IN_APP,
    )
    kind: Mapped[str] = mapped_column(String(KIND_MAX_LENGTH))
    title: Mapped[str] = mapped_column(String(TITLE_MAX_LENGTH))
    body: Mapped[str] = mapped_column(String(BODY_MAX_LENGTH))
    read_at: Mapped[datetime | None] = mapped_column(default=None)
