"""Cash persistence: collections, remittances and their history (FR-041, cash part).

The pilot takes cash on delivery only (fallback F4). Contract:
docs/api/payments.md (agreed G3, 2026-10-22); design:
docs/design/cash-remittance.md.

- ``cash_collections``: one per order, the cash a driver recorded after
  unloading (BR-15) and its custody status ``collected →
  awaiting_remittance → remitted → reconciled`` (FR-041).
- ``cash_remittances``: one per handover an administrator received from a
  driver. It keeps the recorded and counted totals and their difference; it
  is the FR-041 exception record for a counted difference (contract
  decision 1), because one handover covers several orders.
- ``cash_events``: one row per cash step, for the order history. Not
  ``order_events``: those rows always carry a ``to_status``, and no cash
  step changes the order status (BR-12).

Money is integer kobo in ``BigInteger`` columns (SRS §5, BR-01).
"""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, CheckConstraint, Enum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.modules.orders.models import PaymentStatus

#: Kobo per naira. Cash amounts are whole naira (the contract's field rules).
KOBO_PER_NAIRA = 100
NOTE_MAX_LENGTH = 500


class CashCollectionStatus(StrEnum):
    """Custody status of a cash collection (FR-041), in order.

    - ``collected``: the driver recorded it and holds the cash.
    - ``awaiting_remittance``: the driver listed it for a handover; they
      still hold the cash (decision 3).
    - ``remitted``: an administrator confirmed receiving it.
    - ``reconciled``: an administrator matched it to its order.
    """

    COLLECTED = "collected"
    AWAITING_REMITTANCE = "awaiting_remittance"
    REMITTED = "remitted"
    RECONCILED = "reconciled"


#: Statuses in which the driver still holds the cash.
HELD_STATUSES = frozenset(
    {CashCollectionStatus.COLLECTED, CashCollectionStatus.AWAITING_REMITTANCE}
)


class PaymentSmsStatus(StrEnum):
    """Whether the SMS provider accepted the payment acknowledgment (FR-050).

    ``accepted`` means the provider took the message, not that it arrived.
    """

    ACCEPTED = "accepted"
    FAILED = "failed"


class CashEventKind(StrEnum):
    """One step in a collection's history (history ``kind``)."""

    CASH_RECORDED = "cash_recorded"
    CASH_HANDED_OVER = "cash_handed_over"
    CASH_CORRECTED = "cash_corrected"
    CASH_RECEIVED = "cash_received"
    CASH_RECONCILED = "cash_reconciled"


def _str_enum(enum_class: type[StrEnum], name: str, length: int) -> Enum:
    # VARCHAR plus a CHECK constraint, as the rest of the schema does.
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=length,
        values_callable=lambda members: [member.value for member in members],
    )


class CashRemittance(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Cash an administrator received from one driver in one handover (K4).

    Attributes:
        driver_id: The driver who handed the cash over (``users.id``).
        recorded_minor_units: Sum of the received collections' recorded
            amounts.
        counted_minor_units: What the administrator counted.
        difference_minor_units: ``counted - recorded``; negative means short.
            Non-zero is the FR-041 exception (decision 1).
        note: Required by the API when there is a difference.
        received_by: The administrator.
        remitted_at: When they confirmed receiving it.
    """

    __tablename__ = "cash_remittances"
    __table_args__ = (
        CheckConstraint(
            f"recorded_minor_units >= 0 AND counted_minor_units >= 0 "
            f"AND counted_minor_units % {KOBO_PER_NAIRA} = 0",
            name="amounts_whole_naira",
        ),
        CheckConstraint(
            "difference_minor_units = counted_minor_units - recorded_minor_units",
            name="difference_matches",
        ),
    )

    driver_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    recorded_minor_units: Mapped[int] = mapped_column(BigInteger)
    counted_minor_units: Mapped[int] = mapped_column(BigInteger)
    difference_minor_units: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH))
    received_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    remitted_at: Mapped[datetime]


class CashCollection(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The cash a driver collected for one order after unloading (FR-041, BR-15).

    Attributes:
        order_id: The order. Unique: one collection per order (the contract;
            an outstanding balance is collected outside the app, F9).
        driver_id: The driver who recorded it and holds the cash until it is
            received (``users.id``).
        assignment_id: The job that unloaded the water.
        amount_minor_units: The recorded amount in kobo, whole naira, ₦0 or
            more (decision 4). The payment status is worked out from it.
        original_amount_minor_units: The driver's amount, kept when an
            administrator first corrects it (decision 6); null otherwise.
        note: The driver's note; the API requires it when the amount differs
            from the amount due.
        status: :class:`CashCollectionStatus`.
        collected_at: When the driver recorded it.
        remittance_due_at: 18:00 Africa/Lagos on the collection day, or the
            next day when recorded at or after 18:00 (FR-041).
        handed_over_at: When the driver listed it for a handover.
        corrected_by: Administrator who last corrected the amount.
        corrected_at: When.
        correction_reason: Why (required by the API).
        remittance_id: The handover it was received in.
        remitted_at: When an administrator received it.
        received_by: That administrator.
        reconciled_at: When it was reconciled.
        reconciled_by: Administrator who reconciled it.
        reconciliation_note: Optional note.
        payment_sms_status: Outcome of the payment acknowledgment, sent after
            receipt when the amount is above ₦0; null when none was due.
        payment_sms_attempted_at: When it was handed to the provider.
    """

    __tablename__ = "cash_collections"
    __table_args__ = (
        CheckConstraint(
            f"amount_minor_units >= 0 AND amount_minor_units % {KOBO_PER_NAIRA} = 0",
            name="amount_whole_naira",
        ),
        # Received and reconciled carry who and when, and nothing else does.
        CheckConstraint(
            "(status IN ('remitted', 'reconciled')) = "
            "(remittance_id IS NOT NULL AND remitted_at IS NOT NULL AND received_by IS NOT NULL)",
            name="received_fields_match_status",
        ),
        CheckConstraint(
            "(status = 'reconciled') = (reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL)",
            name="reconciled_fields_match_status",
        ),
        Index("ix_cash_collections_driver_id_status", "driver_id", "status"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), unique=True
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), index=True
    )
    amount_minor_units: Mapped[int] = mapped_column(BigInteger)
    original_amount_minor_units: Mapped[int | None] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH))
    status: Mapped[CashCollectionStatus] = mapped_column(
        _str_enum(CashCollectionStatus, "cash_collection_status", 30)
    )
    collected_at: Mapped[datetime]
    remittance_due_at: Mapped[datetime]
    handed_over_at: Mapped[datetime | None]
    corrected_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    corrected_at: Mapped[datetime | None]
    correction_reason: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH))
    remittance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("cash_remittances.id", ondelete="RESTRICT"), index=True
    )
    remitted_at: Mapped[datetime | None]
    received_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    reconciled_at: Mapped[datetime | None]
    reconciled_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    reconciliation_note: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH))
    payment_sms_status: Mapped[PaymentSmsStatus | None] = mapped_column(
        _str_enum(PaymentSmsStatus, "payment_sms_status", 20)
    )
    payment_sms_attempted_at: Mapped[datetime | None]


class CashEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One cash step, shown in the order history with ``include=holds``.

    Attributes:
        collection_id: The collection.
        order_id: Its order (the history is read by order).
        kind: :class:`CashEventKind`.
        actor_id: Driver or administrator who took the step.
        occurred_at: When.
        amount_minor_units: The recorded amount after this step.
        previous_amount_minor_units: The amount before a correction.
        note: The driver's note, the correction reason, the handover's
            difference note or the reconciliation note.
        payment_status: The payment status set by ``cash_received``.
        outstanding_balance_minor_units: Set with ``payment_status``.
    """

    __tablename__ = "cash_events"
    __table_args__ = (Index("ix_cash_events_order_id_occurred_at", "order_id", "occurred_at"),)

    collection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cash_collections.id", ondelete="RESTRICT"), index=True
    )
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"))
    kind: Mapped[CashEventKind] = mapped_column(_str_enum(CashEventKind, "cash_event_kind", 30))
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    occurred_at: Mapped[datetime]
    amount_minor_units: Mapped[int] = mapped_column(BigInteger)
    previous_amount_minor_units: Mapped[int | None] = mapped_column(BigInteger)
    note: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH))
    payment_status: Mapped[PaymentStatus | None] = mapped_column(
        _str_enum(PaymentStatus, "cash_event_payment_status", 30)
    )
    outstanding_balance_minor_units: Mapped[int | None] = mapped_column(BigInteger)
