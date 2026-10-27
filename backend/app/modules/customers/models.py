"""Customer account tables: saved addresses, support and deletion requests.

``customer_addresses`` (SRS §5 ``addresses``): one table for both contracts
that write it, the customer's own addresses (docs/api/customer-account.md,
"Saved addresses") and the admin side (docs/api/admin-directory.md,
"Customers", built in #45). Both use the same rules: a zone is required
(FR-020), the label is 1-50 characters, and a customer has at most one
default address.

An order copies the address text when it is placed, so changing or removing
a saved address never changes an order (FR-024). The SRS lists latitude and
longitude as optional; they are left out until a screen collects them
(admin-directory.md, "Data needed").

``support_requests`` and ``deletion_requests``: docs/api/customer-account.md,
"Support requests" and "Account deletion" (#82, part 4).
"""

import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import Enum, ForeignKey, Index, String, UniqueConstraint, false, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.modules.orders.models import DELIVERY_ADDRESS_MAX_LENGTH, LANDMARK_MAX_LENGTH

#: Labels such as "Home" or "Mum's house": trimmed, 1-50 characters, on both
#: the customer and the admin side (customer-account.md, decision 13).
LABEL_MAX_LENGTH = 50


class CustomerAddress(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One saved delivery address of a customer.

    Attributes:
        customer_id: The customer's account. RESTRICT, as the contract asks:
            the privacy tool removes addresses before it deletes or
            anonymizes an account (``app.modules.customers.retention``).
        zone_id: The service zone the customer picked (FR-020). Kept when
            the zone is switched off; the quote then refuses it (FR-010).
        label: Trimmed name, 1-50 characters.
        address: Trimmed free text, 5-500 characters (as on orders).
        landmark: Optional, up to 200 characters; null when not given.
        is_default: The address offered first. At most one per customer,
            enforced by the partial unique index below; the service keeps
            exactly one whenever the customer has any.
    """

    __tablename__ = "customer_addresses"
    __table_args__ = (
        # The database decides, so two concurrent requests can never leave a
        # customer with two defaults.
        Index(
            "uq_customer_addresses_one_default",
            "customer_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    zone_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("service_zones.id", ondelete="RESTRICT"), index=True
    )
    label: Mapped[str] = mapped_column(String(LABEL_MAX_LENGTH))
    address: Mapped[str] = mapped_column(String(DELIVERY_ADDRESS_MAX_LENGTH))
    landmark: Mapped[str | None] = mapped_column(String(LANDMARK_MAX_LENGTH))
    is_default: Mapped[bool] = mapped_column(default=False, server_default=false())


#: docs/api/customer-account.md, "Support request object".
SUPPORT_MESSAGE_MIN_LENGTH = 3
SUPPORT_MESSAGE_MAX_LENGTH = 1000
#: Reasons and staff notes (deletion reason, refusal reason, resolution note).
NOTE_MAX_LENGTH = 500
#: ``SR-`` or ``DR-`` and 8 Crockford base32 characters.
REQUEST_REFERENCE_LENGTH = 11


class SupportRequestType(StrEnum):
    """What the problem is about (the design's ``ProblemType``)."""

    LATE = "late"
    WRONG_QUANTITY = "wrong_quantity"
    PAYMENT = "payment"
    RIDER = "rider"
    OTHER = "other"


class SupportRequestStatus(StrEnum):
    """A support request is open until staff resolve it."""

    OPEN = "open"
    RESOLVED = "resolved"


class DeletionRequestStatus(StrEnum):
    """Where a deletion request stands (privacy notice §9; contract decision 10).

    ``received`` from the app; staff then set ``acknowledged``, and finally
    ``completed`` or ``refused`` through the privacy tool
    (``app.modules.privacy``).
    """

    RECEIVED = "received"
    ACKNOWLEDGED = "acknowledged"
    COMPLETED = "completed"
    REFUSED = "refused"


#: A request still being handled; a customer has at most one.
OPEN_DELETION_STATUSES = (DeletionRequestStatus.RECEIVED, DeletionRequestStatus.ACKNOWLEDGED)


def _str_enum(enum_class: type[StrEnum], name: str, length: int) -> Enum:
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=length,
        values_callable=lambda members: [member.value for member in members],
    )


class SupportRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A customer's written report for staff to follow up.

    docs/api/customer-account.md, "Support requests". The SRS has no ticket
    feature; this stores the message, which the privacy notice covers as a
    complaint (§8: kept 3 years after resolution). A request never changes
    the order (decision 9). ``created_at`` is when it was sent.

    Attributes:
        reference: ``SR-`` and 8 random characters, not sequential, so
            requests cannot be counted or probed (NFR-002).
        user_id: The customer. RESTRICT: the privacy tool removes or blanks
            requests before it deletes or anonymizes an account.
        order_id: The customer's order it is about, or null. RESTRICT.
        type: :class:`SupportRequestType`.
        message: What the customer wrote, 3-1000 characters. Replaced by
            the privacy tool when the account is anonymized.
        status: :class:`SupportRequestStatus`.
        idempotency_key: The client's key; a retry with the same key returns
            the same request (unique per customer).
        resolved_at: When staff resolved it.
        resolved_by: The admin who resolved it.
        resolution_note: The admin's note (docs/api/admin-operations.md,
            #22); set by ``requests.resolve_support_request`` (#102).
    """

    __tablename__ = "support_requests"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"),)

    reference: Mapped[str] = mapped_column(String(REQUEST_REFERENCE_LENGTH), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    type: Mapped[SupportRequestType] = mapped_column(
        _str_enum(SupportRequestType, "support_request_type", 20)
    )
    message: Mapped[str] = mapped_column(String(SUPPORT_MESSAGE_MAX_LENGTH))
    status: Mapped[SupportRequestStatus] = mapped_column(
        _str_enum(SupportRequestStatus, "support_request_status", 10),
        default=SupportRequestStatus.OPEN,
    )
    idempotency_key: Mapped[uuid.UUID]
    resolved_at: Mapped[datetime | None] = mapped_column(default=None)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), default=None
    )
    resolution_note: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH), default=None)


class DeletionRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A customer's request, from the app, to delete their account.

    docs/api/customer-account.md, "Account deletion". It deletes nothing:
    staff verify it, run the privacy tool, and record the outcome here.
    ``created_at`` is ``requested_at``.

    Attributes:
        reference: ``DR-`` and 8 random characters, quoted when staff call
            back.
        user_id: The customer. RESTRICT, as for support requests.
        reason: Optional, up to 500 characters; never in audit metadata.
            Blanked when the account is anonymized.
        status: :class:`DeletionRequestStatus`. At most one ``received`` or
            ``acknowledged`` request per customer, enforced by the partial
            unique index below.
        acknowledge_by: Lagos date 3 working days (Monday-Friday) after the
            request (privacy notice §9; decision 11). Stored, so the date
            the customer was shown never changes.
        acknowledged_at, completed_at, refused_at: When staff set each
            status.
        refusal_reason: Why it was refused (decision 10: "refused with a
            reason").
        handled_by: The admin who last changed the status.
    """

    __tablename__ = "deletion_requests"
    __table_args__ = (
        Index(
            "uq_deletion_requests_one_open",
            "user_id",
            unique=True,
            postgresql_where=text("status IN ('received', 'acknowledged')"),
        ),
    )

    reference: Mapped[str] = mapped_column(String(REQUEST_REFERENCE_LENGTH), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    reason: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH))
    status: Mapped[DeletionRequestStatus] = mapped_column(
        _str_enum(DeletionRequestStatus, "deletion_request_status", 15),
        default=DeletionRequestStatus.RECEIVED,
    )
    acknowledge_by: Mapped[date]
    acknowledged_at: Mapped[datetime | None] = mapped_column(default=None)
    completed_at: Mapped[datetime | None] = mapped_column(default=None)
    refused_at: Mapped[datetime | None] = mapped_column(default=None)
    refusal_reason: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH), default=None)
    handled_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), default=None
    )
