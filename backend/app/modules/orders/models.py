"""Order persistence: the ``orders`` table and its ``order_events`` history.

Orders are created as price-less requests (docs/api/orders.md, "Why Sprint 1
orders have no price"). For the pilot a dispatcher confirms an order with a
manual quote, a water category, a source and a window (order confirmation,
#113): the price lives in ``order_price_snapshots`` (pricing module), not on
the order. Server quotes and slots come later.

**Order details** (docs/api/order-details-and-price.md, agreed 2026-10-26,
#21): a new order says how it is delivered (``delivery_type``: Keke with
jerrycans, or Tanker filling a tank), with the jerrycan or tank details, the
customer's water source preference (Tanker only) and the service zone they
picked (FR-020). The quantity is still stored in litres, derived exactly from
the details (FR-021). Orders created before #21 have none of these.

The confirmed delivery window is stored as two timestamps on the order
(``delivery_window_start_at``/``end_at``) until delivery slots exist (FR-025);
service zones, which slots need, are an open decision (SRS §12.2). A later
migration replaces them with a slot reference (team decision, 2026-10-19,
docs/features/driver-jobs.md).
"""

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin

# Field limits from docs/api/orders.md ("Field rules"). The database enforces
# a quantity range too, so no code path can store nonsense quantities. It is
# wider than the 600-litre order minimum (quantities.py): requests sent before
# SRS v0.2 may be smaller.
MIN_QUANTITY_LITRES = 1
MAX_QUANTITY_LITRES = 100_000
CONTACT_NAME_MAX_LENGTH = 100
DELIVERY_ADDRESS_MAX_LENGTH = 500
LANDMARK_MAX_LENGTH = 200
DELIVERY_INSTRUCTIONS_MAX_LENGTH = 500
# "MO-" plus 10 Crockford base32 characters (see service.generate_order_reference).
REFERENCE_LENGTH = 13


class OrderStatus(StrEnum):
    """Order (fulfilment) statuses, SRS v0.2 FR-033 and docs/api/deliveries.md.

    Ordinary progression: ``quote_requested`` → [``awaiting_payment``] →
    [``awaiting_confirmation``] → ``confirmed`` → ``assigned`` → ``accepted``
    → ``departed`` → ``collected`` → ``en_route`` → ``arrived`` →
    ``unloading`` → ``delivered``. Alternatives: ``cancelled``, ``failed``,
    ``disputed``. Payment has its own status (BR-12).

    FR-033's ``draft`` is not stored: an unsubmitted order exists only in the
    browser. Allowed transitions and who may make them are in
    ``transitions.py``.
    """

    QUOTE_REQUESTED = "quote_requested"
    # Prepaid orders only: price accepted, payment not yet verified.
    AWAITING_PAYMENT = "awaiting_payment"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    CONFIRMED = "confirmed"
    ASSIGNED = "assigned"
    ACCEPTED = "accepted"
    # The driver has left to fulfil the order (dispatched).
    DEPARTED = "departed"
    COLLECTED = "collected"
    EN_ROUTE = "en_route"
    # Driver at the delivery location; the delivery code becomes usable.
    ARRIVED = "arrived"
    UNLOADING = "unloading"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"
    FAILED = "failed"
    DISPUTED = "disputed"


class TransitionReason(StrEnum):
    """Reason codes recorded with a transition (docs/api/deliveries.md).

    Which codes a transition requires is set in ``transitions.py``.
    """

    DRIVER_DECLINED = "driver_declined"
    REASSIGNED = "reassigned"
    ASSIGNMENT_EXPIRED = "assignment_expired"
    RECORDED_FOR_DRIVER = "recorded_for_driver"
    CUSTOMER_UNREACHABLE = "customer_unreachable"
    UNSAFE_ACCESS = "unsafe_access"
    VEHICLE_FAILURE = "vehicle_failure"
    SOURCE_QUALITY_CONCERN = "source_quality_concern"
    RESCHEDULED = "rescheduled"
    CUSTOMER_REQUEST = "customer_request"
    MMIRIOMA_UNABLE = "mmirioma_unable"
    MISSING_QUANTITY = "missing_quantity"
    WATER_QUALITY = "water_quality"
    HANDLING = "handling"
    DISPUTE_RESOLVED = "dispute_resolved"
    OTHER = "other"
    # Row 26: a dispatcher recorded a manual quote agreed with the customer
    # (pilot fallback F2), always together with row 7 (order confirmation).
    MANUAL_QUOTE = "manual_quote"


class ConfirmationSmsStatus(StrEnum):
    """Whether the SMS provider accepted the order confirmation SMS (FR-050).

    ``accepted`` means the provider took the message, not that it arrived.
    Either way the order stays confirmed: the SMS never changes the order.
    """

    ACCEPTED = "accepted"
    NOT_ACCEPTED = "not_accepted"


class PaymentMethod(StrEnum):
    """How an order is paid (FR-040). The pilot is pay on delivery only (F4)."""

    PAY_ON_DELIVERY = "pay_on_delivery"


class PaymentStatus(StrEnum):
    """An order's payment status, separate from its order status (FR-040, BR-12).

    The pilot uses ``pending_collection``, ``partially_paid`` and ``paid``
    (docs/api/payments.md, "Payment status"); the rest arrive with Paystack,
    bank transfer and refunds. Neither status is ever inferred from the
    other: an order can be ``delivered`` with payment ``pending_collection``
    (T-24).
    """

    UNPAID = "unpaid"
    AWAITING_VERIFICATION = "awaiting_verification"
    PENDING_COLLECTION = "pending_collection"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    PARTIALLY_REFUNDED = "partially_refunded"
    REFUNDED = "refunded"
    DISPUTED = "disputed"


EVENT_NOTE_MAX_LENGTH = 500

# Jerrycan sizes the Keke design offers (c-keke); a quantity is size x count.
KEKE_CAN_SIZES_LITRES = (25, 50)


class DeliveryType(StrEnum):
    """How an order is delivered (design decision 9; order details contract)."""

    #: A Keke (tricycle) carrying jerrycans.
    KEKE = "keke"
    #: A tanker filling the customer's tank.
    TANKER = "tanker"


class TankType(StrEnum):
    """The customer's tank (design c-tanker). Recorded for the driver only (decision 5)."""

    GROUND = "ground"
    OVERHEAD = "overhead"


class WaterSourcePreference(StrEnum):
    """Where a Tanker customer prefers the water collected from (decision 10).

    A preference, not a source assignment and never a quality claim (FR-014):
    the dispatcher still picks an eligible source at confirmation (FR-012).
    """

    NINTH_MILE = "ninth_mile"
    BOREHOLE = "borehole"


def _choice_enum(enum_class: type[StrEnum], name: str, length: int) -> Enum:
    # VARCHAR plus one CHECK, like the status columns (the schema's convention).
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=length,
        values_callable=lambda members: [member.value for member in members],
    )


# Shared by both tables. VARCHAR plus a CHECK constraint rather than a native
# PostgreSQL enum (same choice as users.role), so adding a status later is a
# constraint change in a migration.
def _status_enum(name: str) -> Enum:
    return Enum(
        OrderStatus,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=30,
        values_callable=lambda statuses: [status.value for status in statuses],
    )


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A customer's water order request.

    Attributes:
        reference: Public, non-guessable reference such as ``MO-7KQ2M9XH4T``
            (FR-027). Unique. Used in URLs instead of ``id``.
        customer_id: The ordering customer (``users.id``). Customers may only
            read their own orders (FR-001). Users with orders cannot be deleted.
        idempotency_key: Client-generated UUID, one per checkout attempt. Unique
            per customer, so retries cannot create a second order (FR-026,
            NFR-011).
        status: Current :class:`OrderStatus`.
        quantity_litres: Requested quantity in whole litres. New orders are
            600-100000 litres (``quantities.py``); the column allows 1-100000
            because older requests may be smaller. Every quantity is still a
            manual quote request (FR-021).
        contact_name: Person receiving the delivery (FR-020).
        contact_phone: Their Nigerian mobile number in E.164 form.
        delivery_address: Free-text address (FR-020).
        landmark: Optional landmark.
        delivery_instructions: Optional instructions.
        preferred_delivery_date: Optional preferred date (Africa/Lagos). A
            preference only, not a booked slot (FR-025 slots come later).
        is_simulated: True for demo/test data, which is excluded from real
            metrics (BR-09). Set only by server-side seed scripts.
        source_id: Water source the driver collects from, set when the
            dispatcher confirms the order (FR-011, FR-012). Null before that.
        delivery_window_start_at: Start of the confirmed delivery window
            (UTC). Null until confirmed; stands in for a slot (FR-025).
        delivery_window_end_at: End of that window. Both window columns are
            set together or not at all, and the end is after the start.
        water_category_id: The water category agreed with the customer, set
            when the dispatcher confirms the order (order confirmation
            contract, question 2). Null before that and on older orders; the
            source review (R2) then answers ``cannot_check``.
        confirmation_sms_status: Whether the provider accepted the order
            confirmation SMS (FR-050); null before confirmation. The admin
            detail shows a warning for ``not_accepted``.
        confirmation_sms_attempted_at: When that SMS was handed to the
            provider.
        payment_method: Set to ``pay_on_delivery`` when the order is
            confirmed (F4); null before that.
        payment_status: The order's :class:`PaymentStatus`, independent of
            ``status`` (BR-12). ``pending_collection`` from confirmation
            until an administrator receives the order's cash; then ``paid``
            or ``partially_paid`` (payments module, docs/api/payments.md).
        outstanding_balance_minor_units: Kobo still owed after the cash was
            received; 0 otherwise. Collected outside the app in the pilot (F9).
        overpaid_minor_units: Kobo received above the amount due, flagged for
            review (FR-041); any refund is recorded outside the app (F7).
        delivery_type: :class:`DeliveryType`, or null on orders created
            before #21 (quantity only).
        keke_can_size_litres: Keke only: 25 or 50.
        keke_can_count: Keke only: jerrycans; size x count is the quantity.
        tanker_tank_type: Tanker only: :class:`TankType`.
        tanker_quantity_local_gallons: Tanker only: as sent; the quantity is
            gallons x 4 (FR-021).
        water_source: Tanker only: :class:`WaterSourcePreference`.
        service_zone_id: The zone the customer picked (FR-020), or null when
            their area is not listed. Kept when the zone is later switched
            off (FR-024).
        quote_id: The server quote the order was placed with (pricing
            module), frozen (FR-024); null for a quote request.
    """

    __tablename__ = "orders"
    __table_args__ = (
        # FR-026: the database, not application code, guarantees that one
        # checkout attempt produces at most one order, even under concurrency.
        UniqueConstraint("customer_id", "idempotency_key", name="uq_orders_customer_idempotency"),
        CheckConstraint(
            f"quantity_litres BETWEEN {MIN_QUANTITY_LITRES} AND {MAX_QUANTITY_LITRES}",
            name="quantity_litres_range",
        ),
        # A customer's order list, newest first.
        Index("ix_orders_customer_id_created_at", "customer_id", "created_at"),
        # The dispatcher queue filters by status and creation date (FR-030).
        Index("ix_orders_status_created_at", "status", "created_at"),
        CheckConstraint(
            "(delivery_window_start_at IS NULL AND delivery_window_end_at IS NULL) OR "
            "(delivery_window_start_at IS NOT NULL AND delivery_window_end_at IS NOT NULL "
            "AND delivery_window_end_at > delivery_window_start_at)",
            name="delivery_window_valid",
        ),
        CheckConstraint(
            "outstanding_balance_minor_units >= 0 AND overpaid_minor_units >= 0",
            name="payment_balances_not_negative",
        ),
        # One shape per delivery type, and the stored litres follow exactly
        # from the details (FR-021), so no code path can store a mismatch.
        CheckConstraint(
            "(delivery_type IS NULL AND keke_can_size_litres IS NULL AND keke_can_count IS NULL"
            " AND tanker_tank_type IS NULL AND tanker_quantity_local_gallons IS NULL"
            " AND water_source IS NULL)"
            " OR (delivery_type = 'keke' AND keke_can_size_litres IN (25, 50)"
            " AND keke_can_count >= 1 AND quantity_litres = keke_can_size_litres * keke_can_count"
            " AND tanker_tank_type IS NULL AND tanker_quantity_local_gallons IS NULL"
            " AND water_source IS NULL)"
            " OR (delivery_type = 'tanker' AND tanker_tank_type IS NOT NULL"
            " AND tanker_quantity_local_gallons >= 1"
            " AND quantity_litres = tanker_quantity_local_gallons * 4 AND water_source IS NOT NULL"
            " AND keke_can_size_litres IS NULL AND keke_can_count IS NULL)",
            name="delivery_details_shape",
        ),
    )

    reference: Mapped[str] = mapped_column(String(REFERENCE_LENGTH), unique=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    idempotency_key: Mapped[uuid.UUID]
    status: Mapped[OrderStatus] = mapped_column(_status_enum("order_status"))
    quantity_litres: Mapped[int]
    contact_name: Mapped[str] = mapped_column(String(CONTACT_NAME_MAX_LENGTH))
    contact_phone: Mapped[str] = mapped_column(String(16))
    delivery_address: Mapped[str] = mapped_column(String(DELIVERY_ADDRESS_MAX_LENGTH))
    landmark: Mapped[str | None] = mapped_column(String(LANDMARK_MAX_LENGTH))
    delivery_instructions: Mapped[str | None] = mapped_column(
        String(DELIVERY_INSTRUCTIONS_MAX_LENGTH)
    )
    preferred_delivery_date: Mapped[date | None]
    is_simulated: Mapped[bool] = mapped_column(default=False, server_default=false())
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("water_sources.id", ondelete="RESTRICT"), index=True
    )
    delivery_window_start_at: Mapped[datetime | None]
    delivery_window_end_at: Mapped[datetime | None]
    water_category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("water_categories.id", ondelete="RESTRICT"), index=True
    )
    confirmation_sms_status: Mapped[ConfirmationSmsStatus | None] = mapped_column(
        Enum(
            ConfirmationSmsStatus,
            name="confirmation_sms_status",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda statuses: [status.value for status in statuses],
        )
    )
    confirmation_sms_attempted_at: Mapped[datetime | None]
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(
            PaymentMethod,
            name="payment_method",
            native_enum=False,
            create_constraint=True,
            length=20,
            values_callable=lambda methods: [method.value for method in methods],
        )
    )
    payment_status: Mapped[PaymentStatus | None] = mapped_column(
        Enum(
            PaymentStatus,
            name="payment_status",
            native_enum=False,
            create_constraint=True,
            length=30,
            values_callable=lambda statuses: [status.value for status in statuses],
        )
    )
    outstanding_balance_minor_units: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0"
    )
    overpaid_minor_units: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    delivery_type: Mapped[DeliveryType | None] = mapped_column(
        _choice_enum(DeliveryType, "delivery_type", 10)
    )
    keke_can_size_litres: Mapped[int | None]
    keke_can_count: Mapped[int | None]
    tanker_tank_type: Mapped[TankType | None] = mapped_column(
        _choice_enum(TankType, "tanker_tank_type", 10)
    )
    tanker_quantity_local_gallons: Mapped[int | None]
    water_source: Mapped[WaterSourcePreference | None] = mapped_column(
        _choice_enum(WaterSourcePreference, "water_source", 12)
    )
    service_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_zones.id", ondelete="RESTRICT"), index=True
    )
    quote_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("quotes.id", ondelete="RESTRICT"), index=True
    )


class OrderEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One status change of an order, kept as an audit trail (NFR-004).

    Rows are append-only: they are never updated or deleted, and an order with
    events cannot be deleted.

    Attributes:
        order_id: The order that changed.
        actor_id: User who caused the change, or null for a system action.
        from_status: Previous status; null when the order was created.
        to_status: New status.
        reason_code: :class:`TransitionReason`, where the transition requires
            one (for example ``customer_unreachable`` for a failed delivery,
            FR-038). Null otherwise.
        note: Optional free text from the actor, up to 500 characters;
            required with reason ``other``.
        assignment_id: The assignment an offer, accept, decline or withdraw
            (rows 8-11) was about, so staff history can name the driver
            (docs/api/deliveries.md, "Admin dispatch endpoints"). Null on
            every other event, and on assignment events written before
            revision ``0008``.
    """

    __tablename__ = "order_events"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    from_status: Mapped[OrderStatus | None] = mapped_column(_status_enum("order_event_from_status"))
    to_status: Mapped[OrderStatus] = mapped_column(_status_enum("order_event_to_status"))
    reason_code: Mapped[TransitionReason | None] = mapped_column(
        Enum(
            TransitionReason,
            name="transition_reason",
            native_enum=False,
            create_constraint=True,
            length=40,
            values_callable=lambda reasons: [reason.value for reason in reasons],
        )
    )
    note: Mapped[str | None] = mapped_column(String(EVENT_NOTE_MAX_LENGTH))
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), index=True, default=None
    )
