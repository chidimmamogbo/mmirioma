"""Price snapshots: the price frozen on an order when it is confirmed (FR-024).

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

from sqlalchemy import BigInteger, CheckConstraint, Enum, ForeignKey, String
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
