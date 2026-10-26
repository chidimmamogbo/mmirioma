"""Pricing data: service zones with their delivery fees, and price snapshots.

**Service zones** (FR-010, #30; contract: docs/api/admin-directory.md,
"Service zones", agreed 2026-10-26). An administrator configures each zone
with a name, a centre point, an optional boundary polygon and an active flag,
plus one delivery fee per water category. The fee is the FR-022 fallback
delivery cost while there is no road distance (OSRM is still open, SRS
§12.1): charged once per order, whatever the number of trips. The customer
picks the zone (FR-020); nothing here matches addresses to zones. Points are
PostGIS ``geography`` in WGS 84 (SRID 4326, CLAUDE.md) with no spatial
index, because nothing searches zones by location yet.

**Price snapshots:** the price frozen on an order when it is confirmed (FR-024).

For the pilot the only price is a **manual quote** (pilot fallback F2,
FR-022's own fallback): the total a dispatcher agreed with the customer by
phone or in person, in integer kobo (SRS §5, BR-01). It is stored once, when
the order is confirmed (order confirmation contract, docs/api/deliveries.md),
and never changed afterwards, so later changes to rules, categories or
sources leave the order's total as it was (T-09).

The quote components FR-024 lists (water, delivery, handling, margin, rates,
distance, rounding) come with server quotes; a manual quote has none, so the
snapshot holds the total only and ``is_manual`` is true.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.modules.sources.models import CATEGORY_LABEL_MAX_LENGTH

#: A manual quote is whole naira (FR-022 rounds the payable amount to whole
#: naira): a multiple of 100 kobo, at least ₦1.00. No upper limit (order
#: confirmation decision 7).
KOBO_PER_NAIRA = 100
MIN_MANUAL_QUOTE_MINOR_UNITS = 100


class AgreementMethod(StrEnum):
    """How the customer agreed to the manual quote (the hold review's codes)."""

    PHONE_CALL = "phone_call"
    IN_PERSON_TO_STAFF = "in_person_to_staff"
    OTHER = "other"


class OrderPriceSnapshot(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The price frozen on an order at confirmation (FR-024).

    Attributes:
        order_id: The order. Unique: an order is confirmed with a price once.
        event_id: The row 7 ``order_events`` entry that confirmed it; the
            history shows the confirmation line on that entry.
        total_minor_units: The total the customer pays, in kobo.
        currency: Always ``NGN``.
        is_manual: True for a manual quote (F2); every pilot price is manual.
        water_category_id: The category agreed with the customer.
        water_category_label: The category's label at confirmation, kept so
            a later label change does not alter the order (FR-014).
        source_id: The source chosen at confirmation.
        delivery_window_start_at: The confirmed window's start (UTC), as
            agreed with the customer for this price.
        delivery_window_end_at: Its end. With ``source_id`` they let the
            history show what was confirmed even if the order's window is
            changed later (a reschedule, row 21).
        entered_by: The dispatcher who entered the price.
        entered_at: When they entered it (the confirmation time).
        customer_agreement_method: :class:`AgreementMethod`.
        customer_agreed_at: When the customer agreed, as the dispatcher
            recorded it.
    """

    __tablename__ = "order_price_snapshots"
    __table_args__ = (
        CheckConstraint(
            f"total_minor_units >= {MIN_MANUAL_QUOTE_MINOR_UNITS} "
            f"AND total_minor_units % {KOBO_PER_NAIRA} = 0",
            name="total_whole_naira",
        ),
        CheckConstraint("currency = 'NGN'", name="currency_ngn"),
        CheckConstraint(
            "delivery_window_end_at > delivery_window_start_at", name="window_end_after_start"
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), unique=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_events.id", ondelete="RESTRICT"), unique=True
    )
    total_minor_units: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="NGN", server_default="NGN")
    is_manual: Mapped[bool]
    water_category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("water_categories.id", ondelete="RESTRICT"), index=True
    )
    water_category_label: Mapped[str] = mapped_column(String(CATEGORY_LABEL_MAX_LENGTH))
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("water_sources.id", ondelete="RESTRICT"), index=True
    )
    delivery_window_start_at: Mapped[datetime]
    delivery_window_end_at: Mapped[datetime]
    entered_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    entered_at: Mapped[datetime]
    customer_agreement_method: Mapped[AgreementMethod] = mapped_column(
        Enum(
            AgreementMethod,
            name="agreement_method",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda methods: [method.value for method in methods],
        )
    )
    customer_agreed_at: Mapped[datetime]


#: Zone names are trimmed, 2-100 characters, unique ignoring case (contract).
ZONE_NAME_MIN_LENGTH = 2
ZONE_NAME_MAX_LENGTH = 100


class ServiceZone(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A service zone customers order in (FR-010). Never deleted; switched off.

    Orders and saved addresses will refer to zones, so a zone is kept and
    ``is_active`` set to false instead (contract, "Endpoints").

    Attributes:
        name: Trimmed display name. Unique ignoring case, enforced by the
            ``uq_service_zones_name_lower`` index on ``lower(name)``.
        is_active: Whether new orders may use the zone (FR-010). Switching a
            zone off never changes existing orders (FR-024).
        centre: The zone's coordinates (FR-010, required), a WGS 84 point.
            Typed by an administrator; kept for road distance later.
        boundary: Optional WGS 84 polygon (FR-010), one outer ring.
    """

    __tablename__ = "service_zones"

    name: Mapped[str] = mapped_column(String(ZONE_NAME_MAX_LENGTH))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    centre: Mapped[WKBElement] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False)
    )
    boundary: Mapped[WKBElement | None] = mapped_column(
        Geography(geometry_type="POLYGON", srid=4326, spatial_index=False)
    )


# Case-insensitive uniqueness ("Independence Layout" and "independence layout"
# are one zone). The database decides, so two concurrent creates cannot both
# succeed.
Index("uq_service_zones_name_lower", func.lower(ServiceZone.name), unique=True)


class ServiceZoneDeliveryFee(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A zone's delivery fee for one water category (FR-010, FR-022 fallback).

    Decided for #30 (contract open question 13): one fee per zone and
    category, **per order**. A zone without a fee for a category has no
    fallback for it, and the quote becomes a manual quote
    (``delivery_cost_unavailable``). The pricing service reads these rows;
    see :func:`app.modules.pricing.service.delivery_cost_from_zone`.

    Attributes:
        zone_id: The zone.
        water_category_id: The category the fee applies to (FR-014).
        fee_minor_units: The delivery cost in kobo, 0 or more (BR-01).
    """

    __tablename__ = "service_zone_delivery_fees"
    __table_args__ = (
        UniqueConstraint("zone_id", "water_category_id"),
        CheckConstraint("fee_minor_units >= 0", name="fee_not_negative"),
    )

    zone_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_zones.id", ondelete="RESTRICT"))
    water_category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("water_categories.id", ondelete="RESTRICT"), index=True
    )
    fee_minor_units: Mapped[int] = mapped_column(BigInteger)
