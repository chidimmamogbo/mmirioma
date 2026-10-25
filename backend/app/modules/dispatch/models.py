"""Vehicle profiles, driver profiles and assignments (SRS §5; docs/api/deliveries.md).

- A **vehicle profile** records a vehicle type and its verified safe payload
  in litres (FR-013). Staff create them with the command-line tool.
- A **driver profile** links a ``driver`` account to the vehicle they use and
  says whether they are available for work. The account's ``is_active`` flag
  (FR-002) still decides whether they may work at all.
- An **assignment** offers one order to one driver. The database guarantees
  that an order has at most one live assignment and that a driver has at
  most one live job (``offered`` or ``accepted``), even under concurrent
  requests (FR-031: "concurrent assignments shall not overcommit a driver").
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, String, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin

VEHICLE_TYPE_MAX_LENGTH = 50
MAX_SAFE_PAYLOAD_LITRES = 100_000


class AssignmentStatus(StrEnum):
    """Assignment statuses (docs/api/deliveries.md, "Assignment statuses")."""

    OFFERED = "offered"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    # Kept for when automatic offer expiry is decided; nothing sets it yet.
    EXPIRED = "expired"
    WITHDRAWN = "withdrawn"
    COMPLETED = "completed"


class DeclineReason(StrEnum):
    """Why a driver declined an offer (driver design J2-b; docs/api/deliveries.md)."""

    NOT_AVAILABLE = "not_available"
    VEHICLE_CANNOT_CARRY = "vehicle_cannot_carry"
    TOO_FAR = "too_far"
    UNSAFE_ACCESS = "unsafe_access"
    OTHER = "other"


DECLINE_NOTE_MAX_LENGTH = 300


# An assignment in one of these is "live": it holds the order and the driver.
LIVE_ASSIGNMENT_STATUSES = (AssignmentStatus.OFFERED, AssignmentStatus.ACCEPTED)
_LIVE = "status IN ('offered', 'accepted')"


class VehicleProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A vehicle type and its verified safe payload (FR-013).

    Attributes:
        vehicle_type: Free text, for example "Tricycle with 1,000 L tank".
        safe_payload_litres: Verified safe water payload per trip, adjusted
            for container and equipment weight. Must be checked by staff
            before it is entered; the system cannot verify it.
        is_active: Inactive profiles cannot be given to drivers.
    """

    __tablename__ = "vehicle_profiles"
    __table_args__ = (
        CheckConstraint(
            f"safe_payload_litres BETWEEN 1 AND {MAX_SAFE_PAYLOAD_LITRES}",
            name="safe_payload_litres_range",
        ),
    )

    vehicle_type: Mapped[str] = mapped_column(String(VEHICLE_TYPE_MAX_LENGTH))
    safe_payload_litres: Mapped[int]
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())


class DriverProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Dispatch details of a driver account.

    Attributes:
        user_id: The ``driver`` account; one profile per account.
        vehicle_profile_id: The vehicle the driver uses.
        is_available: Whether the driver can take new work now (FR-031
            "availability"). Set with the command-line tool.
    """

    __tablename__ = "driver_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), unique=True
    )
    vehicle_profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vehicle_profiles.id", ondelete="RESTRICT"), index=True
    )
    is_available: Mapped[bool] = mapped_column(default=True, server_default=true())


class Assignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One offer of one order to one driver (FR-031, FR-032).

    Rows are kept after they end, as the order's assignment history.

    Attributes:
        order_id: The order offered.
        driver_user_id: The driver's account (``users.id``).
        status: :class:`AssignmentStatus`.
        offered_by: The dispatcher who made the offer.
        responded_at: When the driver accepted or declined.
        ended_at: When it stopped being live (declined, withdrawn, completed).
        decline_reason: :class:`DeclineReason` given by the driver, if they
            declined through the driver app. Null otherwise.
        decline_note: The driver's own words with the decline (required for
            ``other`` by the API).
    """

    __tablename__ = "assignments"
    __table_args__ = (
        # At most one live assignment per order, and one live job per driver.
        Index(
            "uq_assignments_live_order",
            "order_id",
            unique=True,
            postgresql_where=text(_LIVE),
        ),
        Index(
            "uq_assignments_live_driver",
            "driver_user_id",
            unique=True,
            postgresql_where=text(_LIVE),
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    driver_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[AssignmentStatus] = mapped_column(
        Enum(
            AssignmentStatus,
            name="assignment_status",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda statuses: [status.value for status in statuses],
        )
    )
    offered_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    responded_at: Mapped[datetime | None] = mapped_column(default=None)
    ended_at: Mapped[datetime | None] = mapped_column(default=None)
    decline_reason: Mapped[DeclineReason | None] = mapped_column(
        Enum(
            DeclineReason,
            name="decline_reason",
            native_enum=False,
            create_constraint=True,
            length=30,
            values_callable=lambda reasons: [reason.value for reason in reasons],
        ),
        default=None,
    )
    decline_note: Mapped[str | None] = mapped_column(String(DECLINE_NOTE_MAX_LENGTH), default=None)
