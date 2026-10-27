"""Delivery persistence (SRS §5, docs/api/deliveries.md "Driver job endpoints").

Tables:

- ``pickup_records``: what the driver collected at the source (FR-034).
- ``delivery_codes``: the customer's 6-digit delivery codes (FR-035), stored
  only as HMAC hashes.
- ``order_exceptions``: incidents and other exceptions for the dispatcher
  (FR-036). An exception with a ``hold_kind`` and no ``resolved_at`` is an
  open hold: the driver must not continue the job. An administrator's
  decision closes it and is recorded on the row (``resolution``, NFR-004).
- ``delivery_attempts``: one per job once the driver arrives (SRS §5,
  FR-038): arrival time, optional consented GPS, whether the driver arrived
  inside the confirmed window, when unloading was recorded complete (#67)
  and the outcome.
- ``contact_attempts``: each attempt to reach an unreachable customer, with
  its time (FR-038).
- ``delivery_proofs``: delivered litres, the unloading confirmation and the
  receiver's acknowledgement, a delivery code or a request for alternative
  proof (FR-035, BR-06). An alternative proof also records the
  administrator's override decision and how the customer confirmed.

GPS points are PostGIS ``geography(POINT, 4326)`` (WGS 84) through
GeoAlchemy2. They are optional and stored only with the driver's prior
consent (FR-035); nothing reads them as tracking.

A driver "job" is a ``dispatch`` :class:`~app.modules.dispatch.models.Assignment`;
this module adds no assignment table of its own. Enumerations are VARCHAR
plus a CHECK constraint (as ``orders.status``), so a new value is a
constraint change in a migration.
"""

import uuid
from datetime import datetime
from enum import StrEnum

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    String,
    false,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base, TimestampMixin, UUIDPrimaryKeyMixin

OTHER_SOURCE_NAME_MAX_LENGTH = 120
SOURCE_REFERENCE_MAX_LENGTH = 100
SAFETY_NOTE_MAX_LENGTH = 500
INCIDENT_NOTE_MAX_LENGTH = 500
MAX_DELIVERY_CODE_ATTEMPTS = 5
ALTERNATIVE_PROOF_NOTE_MAX_LENGTH = 500
RESOLUTION_NOTE_MAX_LENGTH = 500


def _str_enum(enum_class: type[StrEnum], name: str, length: int) -> Enum:
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=length,
        values_callable=lambda members: [member.value for member in members],
    )


class SmsStatus(StrEnum):
    """Whether the SMS provider accepted a delivery code message (FR-050)."""

    ACCEPTED = "accepted"
    FAILED = "failed"


class ExceptionCategory(StrEnum):
    """Kinds of exception (FR-036).

    The first seven are what a driver can report (``IncidentType`` in the
    API). The rest are opened by the system: when a pickup needs attention
    (FR-034, SRS §8 partial delivery), when less was delivered than ordered,
    when a delivery attempt failed because the customer was unreachable
    (FR-036 records failed attempts as exceptions), and when the driver asks
    an administrator to approve alternative proof (FR-035).
    """

    RUNNING_LATE = "running_late"
    UNSAFE_ACCESS = "unsafe_access"
    UNSAFE_TRANSFER = "unsafe_transfer"
    VOLUME_ISSUE = "volume_issue"
    SOURCE_CONCERN = "source_concern"
    VEHICLE_PROBLEM = "vehicle_problem"
    OTHER = "other"
    SOURCE_MISMATCH = "source_mismatch"
    PICKUP_SAFETY_CONCERN = "pickup_safety_concern"
    PARTIAL_PICKUP = "partial_pickup"
    # Opened by the delivery steps (FR-035, FR-036, FR-038).
    PARTIAL_DELIVERY = "partial_delivery"
    CUSTOMER_UNREACHABLE = "customer_unreachable"
    ALTERNATIVE_PROOF = "alternative_proof"


class HoldKind(StrEnum):
    """Why a driver must not continue a job (docs/api/deliveries.md, "Hold")."""

    SOURCE_REVIEW = "source_review"
    UNSAFE_STOP = "unsafe_stop"
    PROOF_REVIEW = "proof_review"


class HoldResolution(StrEnum):
    """How an administrator closed a hold (docs/api/deliveries.md, "Admin hold review").

    The first four are decisions on the hold itself and appear in the staff
    history as "hold decided" entries. The last three close a hold because
    the job ended (fail, cancel, withdraw); the status change shows those.
    """

    PROOF_APPROVED = "proof_approved"
    PROOF_REJECTED = "proof_rejected"
    SOURCE_CONTINUED = "source_continued"
    UNSAFE_RESUMED = "unsafe_resumed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    WITHDRAWN = "withdrawn"


HOLD_DECISIONS = frozenset(
    {
        HoldResolution.PROOF_APPROVED,
        HoldResolution.PROOF_REJECTED,
        HoldResolution.SOURCE_CONTINUED,
        HoldResolution.UNSAFE_RESUMED,
    }
)


class OverrideStatus(StrEnum):
    """An alternative proof's review state (FR-035, row 18)."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class CustomerAcknowledgementMethod(StrEnum):
    """How an administrator confirmed the delivery with the customer (R1)."""

    PHONE_CALL = "phone_call"
    IN_PERSON_TO_STAFF = "in_person_to_staff"
    OTHER = "other"


class PickupRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Water collected for a job (FR-034). One per assignment.

    Attributes:
        assignment_id: The job; unique, so a second pickup is refused.
        order_id: The order, for dispatcher queries.
        source_id: The assigned source, or null when the driver used another.
        other_source_name: Name of the other source; set exactly when
            ``source_id`` is null.
        source_reference: Optional receipt or batch number.
        volume_collected_litres: Whole litres collected (positive).
        picked_up_at: When the driver collected the water (UTC).
        safety_concern: Whether the driver flagged a safety concern.
        safety_note: The driver's description of the concern.
        recorded_by: User who recorded it.
    """

    __tablename__ = "pickup_records"
    __table_args__ = (
        CheckConstraint("volume_collected_litres > 0", name="volume_positive"),
        CheckConstraint("(source_id IS NULL) <> (other_source_name IS NULL)", name="one_source"),
        # The report's pickups per source over a date range (#102).
        Index("ix_pickup_records_picked_up_at", "picked_up_at"),
    )

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), unique=True
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("water_sources.id", ondelete="RESTRICT")
    )
    other_source_name: Mapped[str | None] = mapped_column(String(OTHER_SOURCE_NAME_MAX_LENGTH))
    source_reference: Mapped[str | None] = mapped_column(String(SOURCE_REFERENCE_MAX_LENGTH))
    volume_collected_litres: Mapped[int]
    picked_up_at: Mapped[datetime]
    safety_concern: Mapped[bool] = mapped_column(server_default=false())
    safety_note: Mapped[str | None] = mapped_column(String(SAFETY_NOTE_MAX_LENGTH))
    recorded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))


class DeliveryCode(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A 6-digit delivery code for an order (FR-035).

    Valid 10 minutes, at most 5 verification attempts, single use. Only an
    HMAC of the code is stored. Issuing a new code sets ``invalidated_at`` on
    the earlier ones, so only the newest can work.

    Attributes:
        order_id: The order.
        code_hash: HMAC-SHA256 of the code bound to this row's id.
        issued_at: When it was issued (UTC).
        expires_at: ``issued_at`` plus 10 minutes (FR-035, final).
        attempts: Wrong attempts so far (0-5).
        used_at: When it was accepted as proof.
        invalidated_at: When a newer code replaced it.
        sms_status: :class:`SmsStatus` of the message that carried it.
        issued_by: User whose action issued it.
    """

    __tablename__ = "delivery_codes"
    __table_args__ = (
        CheckConstraint(
            f"attempts BETWEEN 0 AND {MAX_DELIVERY_CODE_ATTEMPTS}", name="attempts_range"
        ),
        Index("ix_delivery_codes_order_id_issued_at", "order_id", "issued_at"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"))
    code_hash: Mapped[str] = mapped_column(String(64))
    issued_at: Mapped[datetime]
    expires_at: Mapped[datetime]
    attempts: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    used_at: Mapped[datetime | None]
    invalidated_at: Mapped[datetime | None]
    sms_status: Mapped[SmsStatus] = mapped_column(_str_enum(SmsStatus, "sms_status", 10))
    issued_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))


class OrderException(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An incident or exception on an order, for the dispatcher (FR-036).

    Attributes:
        order_id: The order.
        assignment_id: The job it came from, if any.
        category: :class:`ExceptionCategory`.
        note: Free-text description.
        new_estimated_arrival_at: Driver's new estimate (``running_late``
            only). Never changes the customer's window (FR-036).
        hold_kind: :class:`HoldKind` if the job must stop until resolved.
        requires_admin_review: True for water-quality concerns (FR-036).
        resolved_at: When staff resolved it; clears the hold.
        reported_by: User who reported or caused it.
        resolved_by: The administrator who closed it.
        resolution: :class:`HoldResolution`, set when a hold is closed (and
            on a partial delivery closed by a rejected proof).
        resolution_note: The administrator's note with the decision.
    """

    __tablename__ = "order_exceptions"
    __table_args__ = (Index("ix_order_exceptions_order_id_created_at", "order_id", "created_at"),)

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"))
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), index=True
    )
    category: Mapped[ExceptionCategory] = mapped_column(
        _str_enum(ExceptionCategory, "exception_category", 30)
    )
    note: Mapped[str | None] = mapped_column(String(INCIDENT_NOTE_MAX_LENGTH))
    new_estimated_arrival_at: Mapped[datetime | None]
    hold_kind: Mapped[HoldKind | None] = mapped_column(_str_enum(HoldKind, "hold_kind", 20))
    requires_admin_review: Mapped[bool] = mapped_column(default=False, server_default=false())
    resolved_at: Mapped[datetime | None]
    reported_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    resolution: Mapped[HoldResolution | None] = mapped_column(
        _str_enum(HoldResolution, "hold_resolution", 20)
    )
    resolution_note: Mapped[str | None] = mapped_column(String(RESOLUTION_NOTE_MAX_LENGTH))


class DeliveryOutcome(StrEnum):
    """How a delivery attempt ended (SRS §5 ``delivery_attempts.outcome``)."""

    DELIVERED = "delivered"
    FAILED = "failed"


class AcknowledgementMethod(StrEnum):
    """How the receiver acknowledged the delivery (FR-035)."""

    DELIVERY_CODE = "delivery_code"
    ALTERNATIVE_PROOF = "alternative_proof"


class AlternativeProofReason(StrEnum):
    """Why the driver asks for alternative proof (contract, ``alternative_proof``)."""

    CUSTOMER_CANNOT_RECEIVE_CODE = "customer_cannot_receive_code"
    OTHER = "other"


def _point() -> Geography:
    # WGS 84 (SRID 4326, CLAUDE.md). No spatial index: nothing searches by
    # location; points are evidence read with their delivery.
    return Geography(geometry_type="POINT", srid=4326, spatial_index=False)


class DeliveryAttempt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The driver's arrival at the customer for one job (SRS §5, FR-038).

    Created when the driver records arrival; one per assignment, so a
    rescheduled order (a new assignment) gets a new attempt.

    Attributes:
        assignment_id: The job; unique.
        order_id: The order, for dispatcher queries.
        arrived_at: Server time of the arrival (UTC). The customer-unreachable
            wait counts from it (FR-038).
        arrival_location: Optional consented GPS point (FR-035).
        arrival_accuracy_metres: The device's reported accuracy, if given.
        within_window: Whether the driver arrived inside the confirmed
            delivery window; null when the order has no window. A redelivery
            fee may apply only if this is true (FR-038, BR-14).
        unloading_completed_at: When the driver recorded unloading complete,
            which issues the delivery code (FR-035, #67).
        outcome: :class:`DeliveryOutcome`, once the attempt ended.
        recorded_by: User who recorded the arrival.
    """

    __tablename__ = "delivery_attempts"

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), unique=True
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    arrived_at: Mapped[datetime]
    arrival_location: Mapped[WKBElement | None] = mapped_column(_point())
    arrival_accuracy_metres: Mapped[float | None]
    within_window: Mapped[bool | None]
    unloading_completed_at: Mapped[datetime | None]
    outcome: Mapped[DeliveryOutcome | None] = mapped_column(
        _str_enum(DeliveryOutcome, "delivery_outcome", 20)
    )
    recorded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))


class ContactAttempt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One attempt to reach the customer after arrival (FR-038).

    Attributes:
        delivery_attempt_id: The arrival it belongs to.
        attempted_at: Server time of the attempt (UTC).
        recorded_by: User who recorded it.
    """

    __tablename__ = "contact_attempts"

    delivery_attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("delivery_attempts.id", ondelete="RESTRICT"), index=True
    )
    attempted_at: Mapped[datetime]
    recorded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))


class DeliveryProof(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """What the driver recorded to complete a delivery (FR-035, BR-06).

    With a delivery code, the code was verified and the order delivered in
    the same transaction. With alternative proof, the order stays
    ``unloading`` under a ``proof_review`` hold until an administrator
    approves it (row 18, the order becomes ``delivered``) or rejects it (it
    no longer counts as proof; the driver can send a new code).

    Attributes:
        assignment_id: The job.
        order_id: The order.
        delivery_attempt_id: The arrival it completes.
        delivered_litres: Litres actually delivered (positive). Below the
            ordered quantity is a partial delivery (an exception is opened).
        unloading_confirmed: The driver's confirmation that they unloaded the
            water; always true (the API refuses false).
        delivered_at: Server time of the proof (UTC); never the phone's
            (design decision 4).
        method: :class:`AcknowledgementMethod`.
        delivery_code_id: The verified code, for ``delivery_code``.
        alternative_reason: :class:`AlternativeProofReason`, for
            ``alternative_proof``.
        alternative_note: The driver's explanation.
        location: Optional consented GPS point (FR-035).
        location_accuracy_metres: The device's reported accuracy, if given.
        recorded_by: User who recorded it.
        override_status: :class:`OverrideStatus` for alternative proof;
            null for a code proof.
        override_decided_by: The administrator who approved or rejected it
            (never the delivering driver, BR-13).
        override_decided_at: When.
        override_note: The administrator's note; for a rejection, the reason.
        customer_ack_method: :class:`CustomerAcknowledgementMethod`, how the
            administrator confirmed with the customer (approval only).
        customer_ack_at: When the customer confirmed.
        customer_ack_note: Optional detail, required with ``other``.
    """

    __tablename__ = "delivery_proofs"
    __table_args__ = (
        CheckConstraint("delivered_litres > 0", name="delivered_litres_positive"),
        CheckConstraint("unloading_confirmed", name="unloading_confirmed"),
        CheckConstraint(
            "(method = 'delivery_code' AND delivery_code_id IS NOT NULL"
            " AND alternative_reason IS NULL)"
            " OR (method = 'alternative_proof' AND delivery_code_id IS NULL"
            " AND alternative_reason IS NOT NULL)",
            name="one_acknowledgement",
        ),
        # Only alternative proof is reviewed by an administrator (FR-035).
        CheckConstraint(
            "(method = 'alternative_proof') = (override_status IS NOT NULL)",
            name="override_only_for_alternative_proof",
        ),
    )

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="RESTRICT"), index=True
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    delivery_attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("delivery_attempts.id", ondelete="RESTRICT"), index=True
    )
    delivered_litres: Mapped[int]
    unloading_confirmed: Mapped[bool]
    delivered_at: Mapped[datetime]
    method: Mapped[AcknowledgementMethod] = mapped_column(
        _str_enum(AcknowledgementMethod, "acknowledgement_method", 20)
    )
    delivery_code_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("delivery_codes.id", ondelete="RESTRICT")
    )
    alternative_reason: Mapped[AlternativeProofReason | None] = mapped_column(
        _str_enum(AlternativeProofReason, "alternative_proof_reason", 40)
    )
    alternative_note: Mapped[str | None] = mapped_column(String(ALTERNATIVE_PROOF_NOTE_MAX_LENGTH))
    location: Mapped[WKBElement | None] = mapped_column(_point())
    location_accuracy_metres: Mapped[float | None]
    recorded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    override_status: Mapped[OverrideStatus | None] = mapped_column(
        _str_enum(OverrideStatus, "override_status", 20)
    )
    override_decided_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    override_decided_at: Mapped[datetime | None]
    override_note: Mapped[str | None] = mapped_column(String(RESOLUTION_NOTE_MAX_LENGTH))
    customer_ack_method: Mapped[CustomerAcknowledgementMethod | None] = mapped_column(
        _str_enum(CustomerAcknowledgementMethod, "customer_ack_method", 20)
    )
    customer_ack_at: Mapped[datetime | None]
    customer_ack_note: Mapped[str | None] = mapped_column(String(RESOLUTION_NOTE_MAX_LENGTH))
